"""`RequestMetricsMiddleware`: counts every API request per endpoint for the
admin's Insights page (`core_api.system.count("http", ...)`) - method plus
the URL pattern, never the actual URL (no ids or tokens), whether it
failed (5xx) and how long it took. Add it to a host's MIDDLEWARE; without
`platform_system` it does nothing."""

import re
import time

from core_api.system import count

_GROUP = re.compile(r"\(\?P<(\w+)>[^)]*\)")


def route_label(route: str) -> str:
    """A URL pattern readable: router regexes (`(?P<pk>[^/.]+)$`) become `{pk}`."""
    label = _GROUP.sub(lambda m: "{" + m.group(1) + "}", route)
    return "/" + label.replace("^", "").replace("$", "").replace("\\", "").lstrip("/")


class RequestMetricsMiddleware:
    #: Only these paths are counted - pages and static files aren't API traffic.
    prefix = "/api/"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith(self.prefix):
            return self.get_response(request)
        started = time.perf_counter()
        response = self.get_response(request)
        match = getattr(request, "resolver_match", None)
        route = route_label(match.route) if match is not None and match.route else "(unmatched)"
        count("http", f"{request.method} {route}", ok=response.status_code < 500,
              ms=(time.perf_counter() - started) * 1000)
        return response
