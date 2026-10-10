"""Shared `{items, total, page, page_size}` pagination envelope - every
module's list endpoints should use this, not DRF's own default envelope,
so every module's list responses share one shape.
"""

from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class EnvelopePageNumberPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_page_size(self, request):
        size = super().get_page_size(request) or self.page_size
        return max(1, min(size, self.max_page_size))

    def paginate_queryset(self, queryset, request, view=None):
        try:
            return super().paginate_queryset(queryset, request, view)
        except NotFound:
            self.request = request
            paginator = self.django_paginator_class(queryset, self.get_page_size(request))
            self.page = paginator.page(1)
            return list(self.page)

    def get_paginated_response(self, data):
        return Response(
            {
                "items": data,
                "total": self.page.paginator.count,
                "page": self.page.number,
                "page_size": self.get_page_size(self.request),
            }
        )

    def get_paginated_response_schema(self, schema):
        # What OpenAPI generators (drf-spectacular) show for a list response.
        return {
            "type": "object",
            "required": ["items", "total", "page", "page_size"],
            "properties": {
                "items": schema,
                "total": {"type": "integer", "description": "Rows matching the query, on every page."},
                "page": {"type": "integer"},
                "page_size": {"type": "integer"},
            },
        }
