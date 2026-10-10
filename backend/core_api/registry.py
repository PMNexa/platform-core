"""Tiny model -> API endpoint registry, so `BaseViewSet.resource_schema()` can tell
a relation field's frontend picker where to fetch its OWN rows from (e.g.
`parent`'s `related_model` is `"Goal"` - this is what turns that into
`"/api/v1/goals"`, see `viewsets.py`'s `_describe_field`). A plural
doesn't invert to a model name (or vice versa) in a general way - see
`Organization`'s own `"orgs"` abbreviation - so this can't be derived, it
has to be told: each app's own urls.py calls `register_model_endpoint`
right next to the `router.register(...)` call that already decides the
same mapping, one extra line per resource.

Also a model -> viewset registry, filled automatically by
`BaseViewSet.__init_subclass__` (no call needed): the generic
`link`/`unlink` actions use the RELATED model's own viewset to scope which
rows a caller may link (its `get_queryset()`, e.g. "only your own goals"),
so linking can't reach a row the caller couldn't list themselves.
"""

_registry: dict[type, str] = {}
_viewsets: dict[type, type] = {}


def register_model_endpoint(model: type, path: str) -> None:
    _registry[model] = path


def model_endpoint(model: type) -> str | None:
    return _registry.get(model)


def endpoint_model(path: str) -> type | None:
    """The model registered at `path` (the inverse of `model_endpoint`) -
    e.g. to check a bare cross-module id (`Meta.related_endpoints`)
    against that model's own viewset."""
    return next((model for model, endpoint in _registry.items() if endpoint == path), None)


def register_model_viewset(model: type, viewset_class: type) -> None:
    _viewsets[model] = viewset_class


def model_viewset(model: type) -> type | None:
    return _viewsets.get(model)


def registered_endpoints() -> dict[type, str]:
    """Every registered model -> endpoint (a copy) - e.g. for an access
    policy to build its permission catalog. Filled as each app's urls.py
    is imported, so load the URLconf first."""
    return dict(_registry)
