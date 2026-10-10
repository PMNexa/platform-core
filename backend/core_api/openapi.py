"""OpenAPI 3 for this platform's API conventions, through drf-spectacular.
How to document a module's API: docs/api-reference.md in the GoalNexa
repo. A host turns it on with

    REST_FRAMEWORK["DEFAULT_SCHEMA_CLASS"] = "core_api.openapi.PlatformAutoSchema"

and mounts drf-spectacular's own views (`SpectacularAPIView`, ...). What
spectacular can't see on its own, described here once for every
`BaseViewSet` - nothing per resource:
- `?include[]=`/`?exclude[]=` (`BaseSerializer`) on list and retrieve,
  with the names `include[]` actually changes (deferred fields and
  relations) as its enum.
- `?filter{field}=` (`DynamicFilterBackend`): a parameter NAME carrying
  the field, which OpenAPI can't template - so it's prose in the list
  operation's description, with the resource's filterable fields.
- `DynamicRelationField`: an id, or the related object when sideloaded.
- The `{items, total, page, page_size}` envelope is
  `EnvelopePageNumberPagination.get_paginated_response_schema` (plain DRF
  hook), `?sort=`/`?q=` DRF's own ordering/search backends.
- `schema`, `relations/<name>/link|unlink`: the generic actions' bodies.
- A plain `APIView` (login, invitations, ...) has no serializer to read:
  free-form JSON bodies and its docstring, until the module describes it
  with `@extend_schema`.
- The `{code, message, field_errors}` error contract
  (`core_api.exceptions`) on every operation's 4xx responses.
- `openapi_auth` on a view (`{scheme_name: security scheme}`): for a
  view that checks a credential itself, with no authentication class to
  hang an `OpenApiAuthenticationExtension` on (e.g. a metric's ingest
  token).
- `openapi_errors` on a view (e.g. `("400", "401", "429")`): the error
  statuses it can answer, when the guess (400 for a body or a list,
  401/403 with authentication, 404 with an id in the path, 429 with a
  throttle) is wrong.
"""

from django.db import models
from drf_spectacular.extensions import OpenApiSerializerFieldExtension
from drf_spectacular.openapi import AutoSchema
from drf_spectacular.plumbing import ResolvedComponent, build_array_type, build_basic_type
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, inline_serializer
from rest_framework import serializers

from core_api.filters import DynamicFilterBackend
from core_api.serializers import BaseSerializer, DynamicRelationField


class ErrorSerializer(serializers.Serializer):
    """`core_api.exceptions.platform_exception_handler`'s response body."""

    code = serializers.CharField(help_text="Machine-readable, e.g. `validation_error`, `not_found`, `limit_reached`.")
    message = serializers.CharField(help_text="Human-readable.")
    field_errors = serializers.DictField(
        child=serializers.ListField(child=serializers.CharField()),
        allow_null=True,
        help_text="Messages per request field (`__root__` = not about one field); null unless validation failed.",
    )

    class Meta:
        ref_name = "Error"


_ERRORS = {
    "400": "Invalid request - `field_errors` says which field.",
    "401": "Missing, invalid or expired access token.",
    "403": "Not allowed (role, organization, or a plan/instance limit).",
    "404": "No such row, or not one the caller can see.",
    "429": "Rate limited.",
}

_LINK_REQUEST = inline_serializer(
    "RelationLinkRequest",
    {
        "ids": serializers.ListField(child=serializers.CharField(), help_text="Ids of the related rows."),
        "through": serializers.DictField(
            required=False,
            help_text="`link` only: the through model's own fields (the schema's `through_fields`), for every new link.",
        ),
    },
)


_GENERIC_ACTIONS = {
    "list": "The {many} the caller can see, a page at a time.",
    "retrieve": "One {one}.",
    "create": "Create a {one}.",
    "update": "Replace a {one}'s writable fields.",
    "partial_update": "Change the {one} fields sent.",
    "destroy": "Delete a {one}.",
    "resource_schema": "How {many} look: every field, and what the caller may do.",
    "link": "Link related rows to a {one} through a many-to-many relation.",
    "unlink": "Remove links from a {one}; the related rows stay.",
}


def _is_base_viewset(view) -> bool:
    from core_api.viewsets import BaseViewSet  # viewsets imports this module's neighbours; keep it lazy

    return isinstance(view, BaseViewSet)


class PlatformAutoSchema(AutoSchema):
    def _action(self):
        return getattr(self.view, "action", None)

    def _base_serializer_class(self):
        if not _is_base_viewset(self.view):
            return None
        serializer_class = self.view.get_serializer_class()
        return serializer_class if issubclass(serializer_class, BaseSerializer) else None

    def get_auth(self):
        schemes = getattr(self.view, "openapi_auth", None)
        if schemes is None:
            return super().get_auth()
        for name, definition in schemes.items():
            self.registry.register_on_missing(
                ResolvedComponent(name=name, type=ResolvedComponent.SECURITY_SCHEMA, object=name, schema=definition)
            )
        return [{name: []} for name in schemes]

    def get_override_parameters(self):
        parameters = super().get_override_parameters()
        serializer_class = self._base_serializer_class()
        if serializer_class is None or self._action() not in ("list", "retrieve"):
            return parameters
        serializer = serializer_class()
        fields = serializer.get_fields()
        expandable = sorted(
            set(getattr(serializer.Meta, "deferred_fields", ()))
            | getattr(serializer, "_auto_deferred", set())
            | {name for name, field in fields.items() if isinstance(field, DynamicRelationField)}
        )
        string_list = build_array_type(build_basic_type(OpenApiTypes.STR))
        include = build_array_type({"type": "string", "enum": expandable}) if expandable else string_list
        return [
            *parameters,
            OpenApiParameter(
                "include[]",
                include,
                description="Fields to add: a deferred field, or a relation to return as the full object instead of its id. "
                "Repeat it or comma-join the names.",
            ),
            OpenApiParameter(
                "exclude[]",
                build_array_type({"type": "string", "enum": sorted(fields)}),
                description="Fields to leave out. Repeat it or comma-join the names.",
            ),
        ]

    def get_description(self):
        serializer_class = self._base_serializer_class()
        action = self._action()
        if serializer_class is None or action not in _GENERIC_ACTIONS:
            # A custom action or plain view: its own docstring.
            return super().get_description()
        # The generic actions' docstrings (and a viewset's class
        # docstring, which spectacular falls back to) are notes for
        # developers, not API users.
        meta = serializer_class.Meta.model._meta
        description = _GENERIC_ACTIONS[action].format(one=meta.verbose_name, many=meta.verbose_name_plural)
        if action == "list" and DynamicFilterBackend in getattr(self.view, "filter_backends", ()):
            names = sorted(field.name for field in meta.concrete_fields)
            description += (
                "\n\nFilter with `?filter{field}=value` (exact match). Add a lookup for others - "
                "`filter{field.icontains}`, `.contains`, `.gt`, `.gte`, `.lt`, `.lte`, `.isnull` (true/false), "
                "`.in` (comma-separated) - prefix the field with `-` to exclude instead (`filter{-status}=done`), "
                "and use `.` to follow a relation (`filter{goal.org_id}=...`). "
                f"Fields: {', '.join(f'`{name}`' for name in names)}."
            )
        return description

    def _plain_api_view(self) -> bool:
        return not hasattr(self.view, "get_serializer_class") and not hasattr(self.view, "get_serializer")

    def get_request_serializer(self):
        if self._plain_api_view():
            return OpenApiTypes.OBJECT if self.method in ("POST", "PUT", "PATCH") else None
        if _is_base_viewset(self.view):
            if self._action() in ("link", "unlink"):
                return _LINK_REQUEST
            if self._action() == "resource_schema":
                return None
        return super().get_request_serializer()

    def get_response_serializers(self):
        if self._plain_api_view():
            return OpenApiResponse(OpenApiTypes.OBJECT, description="JSON - see the operation's description.")
        if _is_base_viewset(self.view):
            if self._action() in ("link", "unlink"):
                return {204: None}
            if self._action() == "resource_schema":
                return OpenApiResponse(
                    build_basic_type(OpenApiTypes.OBJECT),
                    description="Every field this resource can return (type, label, choices, relations) and what "
                    "the caller may do here (`can`) - what the web app builds its forms and tables from.",
                )
        return super().get_response_serializers()

    def _get_response_bodies(self, direction="response"):
        responses = super()._get_response_bodies(direction)
        if direction != "response":
            return responses
        codes = getattr(self.view, "openapi_errors", None)
        if codes is None:
            codes = ["400"] if self.method in ("POST", "PUT", "PATCH") or self._is_list_view() else []
            if self.get_auth():
                codes += ["401", "403"]
            if "{" in self.path:
                codes.append("404")
            if self.view.get_throttles():
                codes.append("429")
        for code in codes:
            if code not in responses:
                responses[code] = self._get_response_for_code(
                    OpenApiResponse(ErrorSerializer, description=_ERRORS.get(code, "Error.")), code
                )
        return responses


class DynamicRelationFieldExtension(OpenApiSerializerFieldExtension):
    """An id (or list of ids) by default, the related object when the field
    is named in `?include[]=`."""

    target_class = DynamicRelationField

    def map_serializer_field(self, auto_schema, direction):
        field = self.target
        related = field._resolve_serializer_class()
        pk = related.Meta.model._meta.pk
        id_schema = build_basic_type(
            OpenApiTypes.UUID if isinstance(pk, models.UUIDField)
            else OpenApiTypes.INT if isinstance(pk, (models.AutoField, models.IntegerField))
            else OpenApiTypes.STR
        )
        nested = auto_schema.resolve_serializer(related, direction)
        item = {"oneOf": [id_schema, nested.ref]} if nested else id_schema
        schema = build_array_type(item) if field.many else item
        schema["description"] = "Id by default; the full object when named in `include[]`."
        return schema
