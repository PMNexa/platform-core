"""Pluggable access policy for every `BaseViewSet` - the seam an
authorization module (e.g. platform-auth's RBAC) plugs into without core
knowing anything about roles, and without each resource's viewset
opting in one by one.

A host names its policy class in settings:

    CORE_API_ACCESS_POLICY = "platform_auth.rbac.policy.RBACPolicy"

Unset (the default), nothing changes: `BaseViewSet` behaves exactly as
before. Set, every `BaseViewSet` runs the policy on top of its own
`permission_classes`/`get_queryset()` scoping (never instead of it):

- `has_permission(request, view)` - before any action (DRF permission).
- `filter_queryset(request, view, queryset)` - narrows what a caller
  sees; runs for every action that reads rows (list, and the lookup
  behind retrieve/update/destroy/link/unlink) and for the rows a
  many-to-many link may reach.
- `has_object_permission(request, view, obj)` - one row: before
  retrieve/update/destroy/link/unlink, and AFTER create/update against
  the saved row (inside a transaction that's rolled back on denial), so a
  row can't be created in, or moved into, a scope the caller has no
  rights in.

What a policy is asked is a (resource, verb) pair - `resource_key(view)`
(the last segment of the resource's registered endpoint: `goals`,
`check-ins`, `orgs`) and `action_verb(view)` (`view`/`create`/`update`/
`delete`) - plus, for a row, its scope: the value at the viewset's
`scope_field` (see `BaseViewSet.scope_field`, e.g. a goal's `org_id`).
"""

from __future__ import annotations

from functools import lru_cache

from django.conf import settings
from django.utils.module_loading import import_string
from rest_framework.permissions import BasePermission

from core_api.registry import model_endpoint

VIEW = "view"
CREATE = "create"
UPDATE = "update"
DELETE = "delete"
VERBS = (VIEW, CREATE, UPDATE, DELETE)

_ACTION_VERBS = {
    "list": VIEW,
    "retrieve": VIEW,
    "resource_schema": VIEW,  # GET <resource>/schema
    "create": CREATE,
    "update": UPDATE,
    "partial_update": UPDATE,
    # Linking/unlinking changes the row the relation hangs off.
    "link": UPDATE,
    "unlink": UPDATE,
    "destroy": DELETE,
}


class AccessPolicy:
    """Base class/protocol for `CORE_API_ACCESS_POLICY` - allows everything."""

    def has_permission(self, request, view) -> bool:
        return True

    def has_object_permission(self, request, view, obj) -> bool:
        return True

    def filter_queryset(self, request, view, queryset):
        return queryset

    def allows(self, request, view, verb: str) -> bool:
        """Whether `verb` is allowed on this resource at all (anywhere) -
        what the schema's `can` reports, so a UI hides what would fail."""
        return True


@lru_cache(maxsize=None)
def _load_policy(path: str) -> AccessPolicy:
    return import_string(path)()


def get_access_policy() -> AccessPolicy | None:
    path = getattr(settings, "CORE_API_ACCESS_POLICY", None)
    return _load_policy(path) if path else None


def action_verb(view) -> str:
    """The verb an action needs; a custom action falls back on its HTTP
    method (a read is `view`, anything else `update`)."""
    verb = _ACTION_VERBS.get(getattr(view, "action", None) or "")
    if verb:
        return verb
    method = getattr(getattr(view, "request", None), "method", "GET")
    return VIEW if method in ("GET", "HEAD", "OPTIONS") else UPDATE


def resource_key(view) -> str | None:
    """The resource's name in permission codenames: the last segment of
    its registered endpoint (`/api/v1/check-ins` -> `check-ins`), else the
    viewset's router basename."""
    queryset = getattr(view, "queryset", None)
    model = getattr(queryset, "model", None)
    endpoint = model_endpoint(model) if model is not None else None
    if endpoint:
        return endpoint.rstrip("/").rsplit("/", 1)[-1]
    return getattr(view, "basename", None)


def scope_of(obj, scope_field: str | None):
    """The value at `scope_field` (Django-style `a__b__c` path) on `obj`,
    or `None` - unscoped, when there's no field or a link on the way is
    empty."""
    if not scope_field:
        return None
    value = obj
    for part in scope_field.split("__"):
        value = getattr(value, part, None)
        if value is None:
            return None
    return getattr(value, "pk", value)


class AccessPolicyPermission(BasePermission):
    """DRF permission delegating to the configured policy - `BaseViewSet`
    appends it to every viewset's own `permission_classes`."""

    def has_permission(self, request, view):
        policy = get_access_policy()
        return policy is None or policy.has_permission(request, view)

    def has_object_permission(self, request, view, obj):
        policy = get_access_policy()
        return policy is None or policy.has_object_permission(request, view, obj)
