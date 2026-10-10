"""Mount at `api/v1/` (like every `BaseViewSet` resource)."""

from django.urls import path
from rest_framework.routers import SimpleRouter

from core_api.registry import register_model_endpoint

from platform_system.email_views import EmailPreferencesView, SesEventsView, SuppressionViewSet, UnsubscribeView
from platform_system.models import AuditEvent, DeliveryAttempt, OutgoingEmail, Suppression, SystemSetting
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
router.register("email-suppressions", SuppressionViewSet, basename="email-suppressions")
for model, endpoint in (
    (SystemSetting, "/api/v1/system-settings"),
    (AuditEvent, "/api/v1/audit-events"),
    (OutgoingEmail, "/api/v1/outgoing-emails"),
    (DeliveryAttempt, "/api/v1/delivery-attempts"),
    (Suppression, "/api/v1/email-suppressions"),
):
    register_model_endpoint(model, endpoint)

urlpatterns = [
    path("announcement", AnnouncementView.as_view(), name="announcement"),
    path("email/preferences", EmailPreferencesView.as_view(), name="email-preferences"),
    path("email/unsubscribe/<str:token>", UnsubscribeView.as_view(), name="email-unsubscribe"),
    path("email/ses-events", SesEventsView.as_view(), name="email-ses-events"),
    *router.urls,
]
