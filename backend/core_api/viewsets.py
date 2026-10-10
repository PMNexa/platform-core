"""`BaseViewSet` - dynamic-rest's `DynamicModelViewSet` equivalent: wires
this platform's own pagination envelope, `?sort=`/`?q=` filtering, and the
`?include[]=`/`?exclude[]=`/`?filter{field}=` query-param conventions
`core_api.serializers.BaseSerializer`/`core_api.filters.
DynamicFilterBackend` implement, so a module only has to declare
`queryset`/`serializer_class` (the standard DRF `ModelViewSet` surface) to
get all of it - no per-module reimplementation of pagination/filtering.

Also auto-`prefetch_related`s any `DynamicRelationField` that's actually
been sideloaded (named in `?include[]=`) - without this, sideloading a
`many=True` relation on a list endpoint means one extra query per row
(the classic N+1), silently, the first time someone tries `?include[]=`
against a real dataset instead of a handful of local test rows.
"""

from django.db import models, transaction
from rest_framework import serializers as drf_serializers
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from core_api.access import CREATE, DELETE, UPDATE, AccessPolicyPermission, get_access_policy
from core_api.filters import DynamicFilterBackend, QParamSearchFilter, SortParamOrderingFilter
from core_api.pagination import EnvelopePageNumberPagination
from core_api.registry import endpoint_model, model_endpoint, model_viewset, register_model_viewset
from core_api.relations import MANY_TO_MANY, through_serializer_class, to_many_relation
from core_api.serializers import DynamicRelationField

_FIELD_TYPES = (
    (drf_serializers.BooleanField, "boolean"),
    (drf_serializers.ChoiceField, "string"),  # before CharField - not a subclass of it
    (drf_serializers.DecimalField, "number"),
    (drf_serializers.FloatField, "number"),
    (drf_serializers.IntegerField, "integer"),
    (drf_serializers.DateTimeField, "datetime"),  # before DateField - IS a subclass of it
    (drf_serializers.DateField, "date"),
    (drf_serializers.EmailField, "email"),
    (drf_serializers.CharField, "string"),
    (drf_serializers.UUIDField, "string"),
)


def _field_type(field) -> str:
    if isinstance(field, DynamicRelationField):
        return "relation"
    for field_class, type_name in _FIELD_TYPES:
        if isinstance(field, field_class):
            return type_name
    return "string"


def _describe_field(name: str, field, *, deferred: bool, cross_module_endpoint: str | None = None, model=None) -> dict:
    description = {
        "name": name,
        "type": _field_type(field),
        "required": bool(getattr(field, "required", False)),
        "read_only": bool(getattr(field, "read_only", False)),
        "label": str(getattr(field, "label", None) or name),
        # Whether an explicit null is accepted - lets a generic form tell
        # "clear this optional value" (send null) apart from "leave it to
        # the server's default" (omit the key) for an emptied input.
        "nullable": bool(getattr(field, "allow_null", False)),
    }
    if isinstance(field, drf_serializers.UUIDField) or (
        isinstance(field, drf_serializers.ModelField) and isinstance(field.model_field, models.UUIDField)
    ):
        # Still `type: "string"` (it's entered/shown as text), but a UI
        # can tell an opaque id apart from human text - e.g. hide a
        # read-only `owner_id` on a detail page.
        description["format"] = "uuid"
    if getattr(field, "style", {}).get("base_template") == "textarea.html":
        # A model `TextField` - long text: a textarea in forms, its own
        # full-width block on a detail page.
        description["multiline"] = True
    help_text = getattr(field, "help_text", None)
    if help_text:
        description["help_text"] = str(help_text)
    if isinstance(field, drf_serializers.ChoiceField):
        description["choices"] = [{"value": value, "label": str(label)} for value, label in field.choices.items()]
    if isinstance(field, DynamicRelationField):
        related_serializer_class = field._resolve_serializer_class()
        related_model = getattr(getattr(related_serializer_class, "Meta", None), "model", None)
        description["many"] = field.many
        description["related_model"] = related_model.__name__ if related_model else None
        description["related_endpoint"] = model_endpoint(related_model) if related_model else None
        # Only a to-many relation is ever actually deferred (see
        # BaseSerializer.get_fields()) - carried through here anyway,
        # explicitly, rather than left to be inferred from "many", so a
        # schema consumer doesn't have to know that rule itself.
        description["deferred"] = deferred
        relation = to_many_relation(model, name) if field.many and model is not None else None
        if relation is not None:
            # What a generic detail screen needs to show/manage this
            # relation's rows - see core_api/relations.py.
            description["kind"] = relation.kind
            description["back_filter"] = relation.back_filter
            if relation.kind == MANY_TO_MANY:
                through_class = through_serializer_class(relation.through) if relation.through else None
                description["through_fields"] = (
                    [_describe_field(n, f, deferred=False) for n, f in through_class().fields.items()] if through_class else []
                )
    elif cross_module_endpoint:
        # A bare id field (e.g. Goal.org_id) pointing at ANOTHER module's
        # model - never a real FK/`DynamicRelationField` (see root
        # AGENTS.md's "no cross-module DB access" rule and `Goal.org_id`'s
        # own docstring), so `_field_type` above already reported it as a
        # plain "string". A serializer's own `Meta.related_endpoints`
        # (see `BaseViewSet.resource_schema`) is what tags it as a relation anyway,
        # purely for the frontend picker's sake - `related_model` stays
        # `None` (there's no local model class to name; a cross-module
        # import here is exactly what the rule forbids), `many` is always
        # `False` (a bare cross-module id is never a list).
        description["type"] = "relation"
        description["many"] = False
        description["related_model"] = None
        description["related_endpoint"] = cross_module_endpoint
    return description


def _display_field(serializer, fields, model) -> str:
    """The field whose value names a row in a UI (a picker option, a detail
    page title, a link to it): the serializer's `Meta.display_field` if
    set, else the first emitted model `CharField` (`title`, `name`, an
    email, a slug - not a `TextField`), else the first emitted non-pk,
    non-relation field, else the pk.
    """
    explicit = getattr(serializer.Meta, "display_field", None)
    if explicit:
        return explicit
    model_fields = {field.name: field for field in model._meta.concrete_fields}
    candidates = [
        name
        for name, field in fields.items()
        if name in model_fields and not model_fields[name].primary_key and not model_fields[name].is_relation
        and not isinstance(field, DynamicRelationField)
    ]
    for name in candidates:
        if isinstance(model_fields[name], models.CharField):
            return name
    return candidates[0] if candidates else model._meta.pk.name


def _scoped_queryset(model, request):
    """`model`'s rows as ITS OWN registered viewset would list them for this
    request (its permissions + `get_queryset()` scoping), or `None` when no
    `BaseViewSet` serves that model."""
    viewset_class = model_viewset(model)
    if viewset_class is None:
        return None
    view = viewset_class(request=request, args=(), kwargs={}, format_kwarg=None, action="list")
    view.check_permissions(request)
    queryset = view.get_queryset()
    policy = get_access_policy()
    return policy.filter_queryset(request, view, queryset) if policy else queryset


def visible_rows(endpoint: str, request):
    """The rows at `endpoint` (e.g. `"/api/v1/orgs"`) this request could
    list there - for a module that must scope by another module's rows
    without importing its models (goalnexa shares an org's goals with the
    org's members). `None` when no `BaseViewSet` serves that endpoint in
    this host; an empty queryset when the caller may not list it at all."""
    model = endpoint_model(endpoint)
    if model is None:
        return None
    try:
        return _scoped_queryset(model, request)
    except PermissionDenied:
        return model.objects.none()


class BaseViewSet(ModelViewSet):
    pagination_class = EnvelopePageNumberPagination
    filter_backends = [DynamicFilterBackend, SortParamOrderingFilter, QParamSearchFilter]
    #: Where a row's access scope lives, as a Django lookup path from this
    #: resource's model (e.g. `"org_id"` on a goal, `"goal__org_id"` on a
    #: metric; `"id"` on the scope model itself). Read only by the
    #: configured access policy (see core_api/access.py) - e.g. RBAC grants
    #: a role within one scope. `None`: rows are unscoped.
    scope_field: str | None = None
    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        queryset = cls.__dict__.get("queryset")
        if queryset is not None:
            register_model_viewset(queryset.model, cls)

    def get_permissions(self):
        # The access policy (core_api/access.py) runs on top of the
        # viewset's own permission classes, never instead of them.
        permissions = super().get_permissions()
        if get_access_policy() is not None:
            permissions.append(AccessPolicyPermission())
        return permissions

    def filter_queryset(self, queryset):
        queryset = super().filter_queryset(queryset)
        policy = get_access_policy()
        return policy.filter_queryset(self.request, self, queryset) if policy else queryset

    def create(self, request, *args, **kwargs):
        # DRF's own `create`, plus the saved row checked against the
        # access policy inside the same transaction - a row created in a
        # scope the caller has no `create` right in is rolled back.
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self._check_cross_module_ids(serializer)
        with transaction.atomic():
            self.perform_create(serializer)
            self._check_saved(serializer.instance)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        # DRF's own `update`; the row was checked before (`get_object`),
        # and is again after saving, so it can't be MOVED into a scope the
        # caller has no `update` right in either.
        partial = kwargs.pop("partial", False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self._check_cross_module_ids(serializer, instance)
        with transaction.atomic():
            self.perform_update(serializer)
            self._check_saved(serializer.instance)
        if getattr(instance, "_prefetched_objects_cache", None):
            instance._prefetched_objects_cache = {}
        return Response(serializer.data)

    def _check_cross_module_ids(self, serializer, instance=None):
        """A bare cross-module id (`Meta.related_endpoints`, e.g. a goal's
        `org_id`) is written like any plain field, so nothing else checks
        it points at a row the caller may see - without this, anyone could
        file a row under someone else's org. Same rule as `link`: the id
        must be one the caller could list through the resource served at
        that endpoint (`_scoped_queryset`). Only a new or changed value is
        checked, so a row keeps its id after the caller loses access to
        it. An endpoint no `BaseViewSet` here serves (e.g. that module
        isn't installed in this host) can't be checked and is let through.
        A field listed in `Meta.unchecked_related_endpoints` is skipped -
        for one whose access is decided some other way (RBAC's
        `scope_id`: the policy checks the scope, and an app-wide admin may
        assign in an org they're no member of).
        """
        meta = getattr(serializer, "Meta", None)
        endpoints = getattr(meta, "related_endpoints", {})
        unchecked = set(getattr(meta, "unchecked_related_endpoints", ()))
        for name, endpoint in endpoints.items():
            if name in unchecked:
                continue
            value = serializer.validated_data.get(name)
            if value is None or (instance is not None and str(getattr(instance, name, None)) == str(value)):
                continue
            model = endpoint_model(endpoint)
            scoped = _scoped_queryset(model, self.request) if model else None
            if scoped is not None and not scoped.filter(pk=value).exists():
                raise ValidationError({name: [f"Unknown id: {value}"]})

    def _check_saved(self, instance):
        if get_access_policy() is not None and instance is not None:
            self.check_object_permissions(self.request, instance)

    def get_queryset(self):
        queryset = super().get_queryset()
        included = set()
        for raw in self.request.query_params.getlist("include[]"):
            included.update(v for v in raw.split(",") if v)
        if not included:
            return queryset

        serializer_class = self.get_serializer_class()
        declared_fields = getattr(serializer_class, "_declared_fields", {})
        prefetchable = {name for name, field in declared_fields.items() if isinstance(field, DynamicRelationField)}
        get_auto_relations = getattr(serializer_class, "get_auto_relations", None)
        if get_auto_relations is not None:
            prefetchable |= set(get_auto_relations())
        to_prefetch = [name for name in included if name in prefetchable]
        return queryset.prefetch_related(*to_prefetch) if to_prefetch else queryset

    # Not named `schema`: that would shadow DRF's `APIView.schema` (the
    # view's OpenAPI generator - see core_api/openapi.py).
    @action(detail=False, methods=["get"], url_path="schema", url_name="schema")
    def resource_schema(self, request):
        """`GET <resource>/schema` - every field this resource's serializer
        can emit, machine-readable enough for a generic CRUD builder to
        derive a form/column/relation-picker config from instead of one
        being hand-written per resource (see goalnexa-frontend's
        `goalsCrudConfig.ts`/`metricsCrudConfig.ts`/`checkInsCrudConfig.ts`
        for the hand-written version this is meant to eventually replace).

        Deliberately bypasses `?include[]=`/`?exclude[]=` filtering (calls
        `get_fields()` directly on a bare instance, not `.fields`, which
        `BaseSerializer.__init__` would have already pruned) - a schema
        describes every POSSIBLE field, including a deferred to-many
        relation this particular request didn't ask to sideload; each
        relation's own `deferred` flag tells the caller which ones that
        applies to, rather than hiding them from the schema entirely.
        No auth/permission bypass here - this action still goes through
        the viewset's own `permission_classes` like any other.

        Besides `fields`: `label`/`label_plural` (the model's
        `verbose_name`/`verbose_name_plural`), `display_field` (the field
        that names a row - see `_display_field`) and `searchable` (whether
        `?q=` does anything here, i.e. the viewset has `search_fields`).

        A serializer's own `Meta.related_endpoints` (`{field_name: url}`,
        e.g. `GoalSerializer`'s `{"org_id": "/api/v1/orgs"}`) tags a bare
        cross-module id field as a relation too, same picker treatment a
        real `DynamicRelationField` gets - see `_describe_field`'s own
        `cross_module_endpoint` branch for why that field can never just
        BE one.
        """
        serializer = self.get_serializer_class()()
        fields = serializer.get_fields()
        deferred = getattr(serializer, "_auto_deferred", set())
        related_endpoints = getattr(getattr(serializer, "Meta", None), "related_endpoints", {})
        for name, field in fields.items():
            # `get_fields()` returns fresh, UNBOUND field instances - only
            # `Field.bind()` (normally triggered by `BindingDict.__setitem__`,
            # i.e. the `.fields` property this deliberately bypasses - see
            # this method's own docstring) fills in `label`'s humanized
            # default ("Target date", not "target_date").
            field.bind(field_name=name, parent=serializer)
        model = serializer.Meta.model
        return Response(
            {
                # Resource-level description, so a generic UI never has
                # to guess names from a URL or a row's shape.
                "label": str(model._meta.verbose_name),
                "label_plural": str(model._meta.verbose_name_plural),
                "display_field": _display_field(serializer, fields, model),
                "searchable": bool(getattr(self, "search_fields", None)),
                "can": self._capabilities(request),
                "fields": [
                    _describe_field(
                        name,
                        field,
                        deferred=name in deferred,
                        cross_module_endpoint=related_endpoints.get(name),
                        model=model,
                    )
                    for name, field in fields.items()
                ],
            }
        )

    def _capabilities(self, request) -> dict:
        """What the caller can do here: the viewset serves the method AND
        the access policy allows the verb somewhere - so a UI shows only
        actions that can succeed (the API still checks each one)."""
        policy = get_access_policy()
        methods = {"create": "post", "update": "patch", "delete": "delete"}
        verbs = {"create": CREATE, "update": UPDATE, "delete": DELETE}
        return {
            name: method in self.http_method_names and (policy is None or policy.allows(request, self, verbs[name]))
            for name, method in methods.items()
        }

    def _m2m_relation(self, relation_name):
        model = self.get_serializer_class().Meta.model
        relation = to_many_relation(model, relation_name)
        if relation is None or relation.kind != MANY_TO_MANY:
            raise NotFound(f"'{relation_name}' is not a many-to-many relation.")
        return relation

    @staticmethod
    def _requested_ids(request) -> list:
        ids = request.data.get("ids")
        if not isinstance(ids, list) or not ids:
            raise ValidationError({"ids": ["A non-empty list of ids is required."]})
        return list(dict.fromkeys(str(value) for value in ids))

    @action(detail=True, methods=["post"], url_path=r"relations/(?P<relation_name>\w+)/link")
    def link(self, request, pk=None, relation_name=None):
        """`POST <resource>/<id>/relations/<relation>/link` - `{"ids": [...],
        "through": {...}}` - adds many-to-many links from this row to each
        id. Only ids the caller could list through the RELATED resource's
        own viewset count (`_scoped_queryset`) - any other id fails the
        whole request, nothing is linked. `through` holds a custom through
        model's own fields (see `schema`'s `through_fields`), validated by
        a plain `ModelSerializer` over them; applied to every new link.
        Already-linked ids are left as they are.
        """
        relation = self._m2m_relation(relation_name)
        instance = self.get_object()
        ids = self._requested_ids(request)
        scoped = _scoped_queryset(relation.related_model, request)
        if scoped is None:
            raise PermissionDenied(f"'{relation_name}' rows aren't served by any API, so they can't be linked.")
        related = list(scoped.filter(pk__in=ids))
        if len(related) != len(ids):
            found = {str(row.pk) for row in related}
            raise ValidationError({"ids": [f"Unknown id: {value}" for value in ids if value not in found]})

        through_defaults = {}
        through_class = through_serializer_class(relation.through) if relation.through else None
        if through_class is not None:
            through = through_class(data=request.data.get("through") or {})
            through.is_valid(raise_exception=True)
            through_defaults = through.validated_data
        getattr(instance, relation.name).add(*related, through_defaults=through_defaults)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path=r"relations/(?P<relation_name>\w+)/unlink")
    def unlink(self, request, pk=None, relation_name=None):
        """`POST <resource>/<id>/relations/<relation>/unlink` - `{"ids": [...]}`
        - removes those links (the related rows themselves stay). Ids not
        currently linked are ignored.
        """
        relation = self._m2m_relation(relation_name)
        instance = self.get_object()
        manager = getattr(instance, relation.name)
        manager.remove(*manager.filter(pk__in=self._requested_ids(request)))
        return Response(status=status.HTTP_204_NO_CONTENT)
