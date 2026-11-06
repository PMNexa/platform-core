"""The shared `{code, message, field_errors}` error contract as a DRF
`EXCEPTION_HANDLER` - every module wires
`"core_api.exceptions.platform_exception_handler"` into its own
`REST_FRAMEWORK["EXCEPTION_HANDLER"]` so all of this platform's APIs
respond with the same error shape. platform-auth and platform-org used to
each vendor their own near-identical copy of this file (with their own
`platform_auth_exception_handler`/`platform_org_exception_handler` names)
- now that both depend on this package instead, there's exactly one
handler function every module's settings.py points at.
"""

from rest_framework import exceptions as drf_exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_default_exception_handler

from core_api.errors import ApiError
from core_api.i18n import tr
from core_api.system import count

_STATUS_CODE_TO_GENERIC_CODE = {
    400: "bad_request",
    401: "invalid_token",
    403: "permission_denied",
    404: "not_found",
    405: "method_not_allowed",
    429: "rate_limited",
    500: "internal_error",
}


def _flatten_drf_validation_error(exc: drf_exceptions.ValidationError) -> dict[str, list[str]]:
    field_errors: dict[str, list[str]] = {}
    detail = exc.detail
    if isinstance(detail, dict):
        for field, messages in detail.items():
            field_errors[str(field)] = [tr(m) for m in messages] if isinstance(messages, list) else [tr(messages)]
    elif isinstance(detail, list):
        field_errors["__root__"] = [tr(m) for m in detail]
    else:
        field_errors["__root__"] = [tr(detail)]
    return field_errors


def _translated_field_errors(field_errors):
    """An `ApiError`'s `{field: [message, ...]}` with each plain-string
    message in the request's language (see core_api/i18n.py)."""
    if not isinstance(field_errors, dict):
        return field_errors
    return {
        field: [tr(m) if isinstance(m, str) else m for m in messages] if isinstance(messages, list)
        else tr(messages) if isinstance(messages, str) else messages
        for field, messages in field_errors.items()
    }


def platform_exception_handler(exc, context):
    if isinstance(exc, ApiError):
        return Response(
            # Messages are written in English; `tr` answers them in the
            # request's language when a translation exists (core_api/i18n.py).
            {"code": exc.code, "message": tr(exc.message), "field_errors": _translated_field_errors(exc.field_errors)},
            status=exc.status_code,
        )

    response = drf_default_exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, drf_exceptions.Throttled):
        # For the admin's Insights page: which endpoint turned callers away.
        view = context.get("view")
        count("rate_limit", type(view).__name__ if view is not None else "unknown")

    if isinstance(exc, drf_exceptions.ValidationError):
        response.data = {
            "code": "validation_error",
            "message": tr("Request failed validation."),
            "field_errors": _flatten_drf_validation_error(exc),
        }
        return response

    detail = getattr(exc, "detail", None)
    message = tr(detail) if detail is not None and not isinstance(detail, (list, dict)) else tr("Request failed.")
    response.data = {
        "code": _STATUS_CODE_TO_GENERIC_CODE.get(response.status_code, "http_error"),
        "message": message,
        "field_errors": None,
    }
    return response
