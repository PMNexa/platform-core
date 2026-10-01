"""Writes `AuditEvent`s - see `core_api.system.audit`."""

from rest_framework.throttling import BaseThrottle

from platform_system.models import AuditEvent


def client_ip(request) -> str:
    """The client's IP as the auth rate limits see it (X-Forwarded-For,
    trusting REST_FRAMEWORK's NUM_PROXIES)."""
    try:
        return BaseThrottle().get_ident(request) or ""
    except Exception:
        return ""


def record(action, *, request=None, actor=None, target=None, target_type="", target_id=None, target_label="",
           data=None) -> AuditEvent:
    if actor is None and request is not None:
        user = getattr(request, "user", None)
        actor = user if getattr(user, "is_authenticated", False) else None
    if target is not None:
        target_type = target_type or target._meta.model_name
        target_id = target_id or target.pk
        target_label = target_label or str(getattr(target, "email", "") or target)
    meta = getattr(request, "META", {}) if request is not None else {}
    return AuditEvent.objects.create(
        action=action,
        actor_id=str(getattr(actor, "id", "") or ""),
        actor_email=str(getattr(actor, "email", "") or "")[:255],
        target_type=target_type or "",
        target_id=str(target_id or ""),
        target_label=(target_label or "")[:255],
        ip=client_ip(request) if request is not None else "",
        user_agent=str(meta.get("HTTP_USER_AGENT", ""))[:255],
        data=data or {},
    )
