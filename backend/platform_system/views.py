"""Admin APIs - plain `BaseViewSet`s, so RBAC guards them like any
resource (`system-settings.update`, `audit-events.view`, ...; only roles
granting them - e.g. Admin - can use them). None are MCP tools.

- `GET   /api/v1/system-settings` - every registered setting with its
  effective value and where it comes from (`env` = locked, `saved`,
  `default`), plus the read-only deployment facts (`info.system_info`).
- `PATCH /api/v1/system-settings/<key>` `{value}` - save; `DELETE` - back
  to its default. Both audited.
- `POST  /api/v1/system-settings/test-email` `{to?}` - sends a test email
  (to the caller by default) right away and reports the outcome.
- `GET   /api/v1/audit-events` (+ `/export` - CSV of the filtered list).
- `GET   /api/v1/outgoing-emails` - the delivery log; `POST <id>/retry`.
- `GET   /api/v1/system-settings/status` - scheduler, deliveries, usage.
- `GET   /api/v1/delivery-attempts` - the notification (Apprise) log.
- `GET   /api/v1/announcement` - the banner, for every signed-in user.
"""

import csv
import io

from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from core_api.system import (
    audit,
    default_value,
    env_value,
    get_setting,
    send_email,
    setting_definition,
    setting_definitions,
)
from core_api.viewsets import BaseViewSet

from platform_system import store
from platform_system.info import system_info
from platform_system.mail import deliver
import hashlib

from rest_framework.views import APIView

from platform_system.models import AuditEvent, DeliveryAttempt, EmailStatus, OutgoingEmail, SystemSetting
from platform_system.ops import status as system_status
from platform_system.serializers import (
    AuditEventSerializer,
    DeliveryAttemptSerializer,
    OutgoingEmailSerializer,
    SystemSettingSerializer,
)


def _describe(definition) -> dict:
    locked, env = env_value(definition)
    found, saved = store.stored_value(definition.key) if definition.editable else (False, None)
    return {
        "key": definition.key,
        "label": definition.label,
        "type": definition.type,
        "group": definition.group,
        "help": definition.help,
        "choices": [{"value": v, "label": label} for v, label in (definition.choices or [])],
        "value": get_setting(definition.key),
        "default": default_value(definition),
        "source": "env" if locked else "saved" if found else "default",
        "env": definition.env,
        "editable": definition.editable and not locked,
    }


class SystemSettingViewSet(BaseViewSet):
    queryset = SystemSetting.objects.all()
    serializer_class = SystemSettingSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]
    lookup_field = "key"
    lookup_value_regex = r"[\w.]+"
    mcp_enabled = False

    def list(self, request, *args, **kwargs):
        definitions = sorted(setting_definitions(), key=lambda d: (d.group, d.label))
        return Response({"settings": [_describe(d) for d in definitions], "info": system_info()})

    def _definition(self, key):
        try:
            return setting_definition(key)
        except KeyError:
            raise ValidationError({"key": ["Unknown setting."]}) from None

    def partial_update(self, request, key=None):
        definition = self._definition(key)
        if "value" not in request.data:
            raise ValidationError({"value": ["This field is required."]})
        before = get_setting(key)
        try:
            value = store.save(key, request.data["value"], str(request.user.id))
        except PermissionError as exc:
            raise PermissionDenied(str(exc)) from None
        except (ValueError, TypeError) as exc:
            raise ValidationError({"value": [str(exc) or "Invalid value."]}) from None
        audit("settings.updated", request=request, target_type="setting", target_id=key,
              target_label=definition.label, before=before, after=value)
        return Response(_describe(definition))

    def destroy(self, request, key=None):
        definition = self._definition(key)
        if env_value(definition)[0] or not definition.editable:
            raise PermissionDenied(f"{definition.label} can't be changed here.")
        before = get_setting(key)
        store.reset(key)
        audit("settings.reset", request=request, target_type="setting", target_id=key,
              target_label=definition.label, before=before, after=get_setting(key))
        return Response(_describe(definition))

    def retrieve(self, request, key=None):
        return Response(_describe(self._definition(key)))

    @action(detail=False, methods=["get"])
    def insights(self, request):
        """The Insights page: daily numbers over `?days=` (1-90, default 30)
        and the previous period, plus every module's sections."""
        from platform_system.insights import clamp_days, insights

        return Response(insights(clamp_days(request.query_params.get("days"))))

    @action(detail=False, methods=["get"], url_path="insights-csv")
    def insights_csv(self, request):
        """The daily numbers as CSV, one column per series."""
        from platform_system.insights import clamp_days, insights_csv

        days = clamp_days(request.query_params.get("days"))
        response = HttpResponse(insights_csv(days), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="insights-{days}d.csv"'
        return response

    @action(detail=False, methods=["get"])
    def status(self, request):
        """The Status page: scheduler heartbeats, last day's deliveries, usage."""
        return Response(system_status())

    @action(detail=False, methods=["post"], url_path="test-email")
    def test_email(self, request):
        to = request.data.get("to") or getattr(request.user, "email", "")
        if not to:
            raise ValidationError({"to": ["Give an address to send to."]})
        before = set(OutgoingEmail.objects.filter(kind="test").values_list("id", flat=True))
        send_email(to, "GoalNexa test email", "Email from this GoalNexa instance works.", kind="test",
                   user_id=request.user.id)
        message = OutgoingEmail.objects.filter(kind="test").exclude(id__in=before).order_by("-created_at").first()
        if message and message.status == EmailStatus.QUEUED:
            deliver(message.id)  # not waiting for the commit hook: the caller wants the result now
            message.refresh_from_db()
        audit("email.test_sent", request=request, target_label=to)
        return Response({
            "to": to,
            "status": message.status if message else "sent",
            "error": message.last_error if message else "",
        })


class AuditEventViewSet(BaseViewSet):
    queryset = AuditEvent.objects.all()
    serializer_class = AuditEventSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "head", "options"]
    search_fields = ["action", "actor_email", "target_label", "ip"]
    mcp_enabled = False

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")

    @action(detail=False, methods=["get"])
    def export(self, request):
        rows = self.filter_queryset(self.get_queryset())[:50000]
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["time", "action", "actor", "actor_id", "target_type", "target", "target_id", "ip",
                         "user_agent", "data"])
        for e in rows:
            writer.writerow([e.created_at.isoformat(), e.action, e.actor_email, e.actor_id, e.target_type,
                             e.target_label, e.target_id, e.ip, e.user_agent, e.data])
        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="audit-{timezone.localdate()}.csv"'
        return response


class OutgoingEmailViewSet(BaseViewSet):
    queryset = OutgoingEmail.objects.all()
    serializer_class = OutgoingEmailSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "post", "head", "options"]
    search_fields = ["subject", "kind"]
    mcp_enabled = False

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")

    def create(self, request, *args, **kwargs):
        return Response(status=status.HTTP_405_METHOD_NOT_ALLOWED)

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        message = self.get_object()
        if message.status == EmailStatus.SENT:
            raise ValidationError({"status": ["Already sent."]})
        OutgoingEmail.objects.filter(id=message.id).update(status=EmailStatus.QUEUED, next_attempt_at=timezone.now())
        deliver(message.id)
        message.refresh_from_db()
        return Response(OutgoingEmailSerializer(message).data)


class DeliveryAttemptViewSet(BaseViewSet):
    """The Notification log - Apprise reminders and digests (email has its own log)."""

    queryset = DeliveryAttempt.objects.all()
    serializer_class = DeliveryAttemptSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "head", "options"]
    search_fields = ["kind", "target", "error"]
    mcp_enabled = False

    def get_queryset(self):
        return super().get_queryset().order_by("-created_at")


class AnnouncementView(APIView):
    """`GET /api/v1/announcement` - the banner every signed-in user sees
    (the `system.announcement*` settings); `id` changes with the text, so a
    dismissed banner comes back when it's edited."""

    permission_classes = [IsAuthenticated]

    def get(self, request):
        text = (get_setting("system.announcement") or "").strip()
        if not text:
            return Response({"text": "", "level": "info", "id": ""})
        level = get_setting("system.announcement_level") or "info"
        return Response({"text": text, "level": level, "id": hashlib.sha256(text.encode()).hexdigest()[:12]})
