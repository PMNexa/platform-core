"""`BaseSerializer` - dynamic field selection + relation sideloading,
the same two ideas django-rest-framework's `dynamic-rest` package is
built around. Reimplemented against this platform's own conventions
(`?include[]=`/`?exclude[]=` naming, no dependency on dynamic-rest itself)
rather than vendored, since dynamic-rest hard-codes its own pagination/
routing opinions this platform already has its own answers for
(`EnvelopePageNumberPagination`, `?sort=`/`?q=` - see pagination.py/
filters.py).

Two behaviors:
- `?include[]=field`/`?exclude[]=field` control which declared fields
  actually serialize. A field listed in `Meta.deferred_fields` is left
  out unless explicitly included; any field can be excluded on request.
- `DynamicRelationField` wraps another `BaseSerializer` for a relation.
  It renders as a bare id (or list of ids for `many=True`) by default -
  "sideloading" it (naming it in `?include[]=`) swaps in the full nested
  representation instead. Usually paired with listing the relation's name
  in `Meta.deferred_fields`, so a plain list/retrieve stays cheap and a
  caller opts into the expensive nested representation explicitly.
"""

from __future__ import annotations

from rest_framework import serializers
from rest_framework.utils import model_meta


def _query_param_set(request, param: str) -> set[str]:
    """Query lists sent as a bare comma-joined value (`?include[]=a,b`) as
    well as literal repeats (`?include[]=a&include[]=b`) - both are common
    depending on how the caller builds the query string.
    """
    if request is None:
        return set()
    values: set[str] = set()
    for raw in request.query_params.getlist(param):
        values.update(v for v in raw.split(",") if v)
    return values


class DynamicRelationField(serializers.Field):
    def __init__(self, serializer_class, *, many: bool = False, **kwargs):
        # Accepts the class directly, or a zero-arg callable returning it
        # (e.g. a lambda) - lets two serializers reference each other
        # (Organization -> memberships -> OrgMembership -> org -> ...)
        # without a circular import at module load time.
        self._serializer_class = serializer_class
        self.many = many
        kwargs.setdefault("read_only", True)
        super().__init__(**kwargs)

    def _resolve_serializer_class(self):
        cls = self._serializer_class
        return cls() if callable(cls) and not isinstance(cls, type) else cls

    def to_representation(self, value):
        if value is None:
            return [] if self.many else None

        request = self.context.get("request")
        included = _query_param_set(request, "include[]")

        if self.field_name in included:
            serializer_class = self._resolve_serializer_class()
            return serializer_class(value, many=self.many, context=self.context).data

        if self.many:
            related_iterable = value.all() if hasattr(value, "all") else value
            return [related.pk for related in related_iterable]
        return value.pk


class BaseSerializer(serializers.ModelSerializer):
    """Subclass instead of `serializers.ModelSerializer` for any entity
    that should support dynamic field selection. `Meta.fields` lists
    every field this serializer CAN emit, same as plain DRF; the optional
    `Meta.deferred_fields` (a subset of `Meta.fields`) lists the ones left
    out unless explicitly named in `?include[]=`.

    `Meta.fields` is optional - omit it (and `Meta.exclude`) and every
    model field is emitted (DRF's own `fields = "__all__"`), same as
    declaring nothing at all. Still overridable: name `Meta.fields`
    explicitly to whitelist a subset.

    In that same auto-fields mode, every relation on the model - forward
    (FK/O2O) or reverse/many (the "_set" side, or M2M either direction) -
    is also auto-added, each wrapped as a `DynamicRelationField`. Only the
    to-many ones are auto-deferred too (as if hand-declared and listed in
    `Meta.deferred_fields`) - fetching those is an extra query per row
    (the N+1 `BaseViewSet.get_queryset` prefetches against), same
    "expensive, opt in" reasoning `Organization.memberships` was hand-
    deferred for originally. A to-one forward relation (a plain FK/O2O
    column already sitting on this row) stays un-deferred, rendering as
    a bare id by default same as `DynamicRelationField`'s own docstring
    describes - no reason to hide a column that's already there. This
    only fires for a related model that itself has a registered
    `BaseSerializer` (keyed by `Meta.model` as subclasses are defined); a
    relation with no serializer to sideload is left as DRF's plain
    default (bare pk for a forward relation, absent for a reverse one),
    same as before.

    `Meta.auto_exclude` drops named fields outright, permanently - unlike
    `?exclude[]=`, which is a per-request opt-out a caller can undo simply
    by not passing it. Only meaningful alongside auto-fields mode (plain
    `Meta.fields`/`Meta.exclude` already whitelist/blacklist directly).
    """

    _model_registry: dict = {}
    _auto_fields = False

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        meta = cls.__dict__.get("Meta")
        if meta is None:
            return
        model = getattr(meta, "model", None)
        if model is not None:
            BaseSerializer._model_registry[model] = cls
        if not hasattr(meta, "fields") and not hasattr(meta, "exclude"):
            meta.fields = "__all__"
            cls._auto_fields = True

    @classmethod
    def get_auto_relations(cls):
        """Every relation `get_fields()` would auto-wrap for this class:
        `{field_name: RelationInfo}`, keyed the same way as
        `model_meta.get_field_info().forward_relations`/`reverse_relations`.
        A classmethod (no instance/request needed) so `BaseViewSet` can
        tell which `?include[]=` names are auto-added relations worth
        `prefetch_related`-ing, the same way it already does for a
        hand-declared `DynamicRelationField` in `_declared_fields`.
        """
        if not cls._auto_fields:
            return {}
        declared = set(cls._declared_fields)
        info = model_meta.get_field_info(cls.Meta.model)
        relations = {**info.forward_relations, **info.reverse_relations}
        return {
            name: relation_info
            for name, relation_info in relations.items()
            if name not in declared and cls._model_registry.get(relation_info.related_model) is not None
        }

    def get_fields(self):
        fields = super().get_fields()
        self._auto_deferred: set[str] = set()
        for name, relation_info in self.get_auto_relations().items():
            related_model = relation_info.related_model
            fields[name] = DynamicRelationField(
                lambda m=related_model: self._model_registry.get(m),
                many=relation_info.to_many,
            )
            if relation_info.to_many:
                self._auto_deferred.add(name)
        for name in getattr(self.Meta, "auto_exclude", ()):
            fields.pop(name, None)
        return fields

    def build_standard_field(self, field_name, model_field):
        field_class, field_kwargs = super().build_standard_field(field_name, model_field)
        if issubclass(field_class, serializers.FileField):
            # Read back as the stored name, not a MEDIA_URL link: files are
            # fetched through `BaseViewSet.files` (same scoping as the row),
            # never served as static media.
            field_kwargs["use_url"] = False
        return field_class, field_kwargs

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        fields = self.fields  # first access - runs get_fields(), fills self._auto_deferred
        deferred = set(getattr(self.Meta, "deferred_fields", ())) | self._auto_deferred
        included = _query_param_set(request, "include[]")
        excluded = _query_param_set(request, "exclude[]")
        for name in list(fields):
            if name in excluded or (name in deferred and name not in included):
                del fields[name]
