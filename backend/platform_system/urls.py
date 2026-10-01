"""Mount at `api/v1/` (like every `BaseViewSet` resource)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from core_api.registry import register_model_endpoint

from platform_system.models import AuditEvent, DeliveryAttempt, OutgoingEmail, SystemSetting
from platform_system.views import (
    AnnouncementView,
    AuditEventViewSet,
    DeliveryAttemptViewSet,
    OutgoingEmailViewSet,
    SystemSettingViewSet,
)

router = SimpleRouter(trailing_slash=False)
router.register("system-settings", SystemSettingViewSet, basename="system-settings")
router.register("audit-events", AuditEventViewSet, basename="audit-events")
router.register("outgoing-emails", OutgoingEmailViewSet, basename="outgoing-emails")
router.register("delivery-attempts", DeliveryAttemptViewSet, basename="delivery-attempts")
for model, endpoint in (
    (SystemSetting, "/api/v1/system-settings"),
    (AuditEvent, "/api/v1/audit-events"),
    (OutgoingEmail, "/api/v1/outgoing-emails"),
    (DeliveryAttempt, "/api/v1/delivery-attempts"),
):
    register_model_endpoint(model, endpoint)

urlpatterns = [path("announcement", AnnouncementView.as_view(), name="announcement"), *router.urls]
