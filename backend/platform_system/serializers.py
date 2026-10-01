from core_api.serializers import BaseSerializer

from platform_system.models import AuditEvent, DeliveryAttempt, OutgoingEmail, SystemSetting


class SystemSettingSerializer(BaseSerializer):
    class Meta:
        model = SystemSetting
        fields = ["key", "value", "updated_by", "updated_at"]


class AuditEventSerializer(BaseSerializer):
    class Meta:
        model = AuditEvent
        display_field = "action"


class OutgoingEmailSerializer(BaseSerializer):
    """The delivery log - bodies left out of lists (`?include[]=text`)."""

    class Meta:
        model = OutgoingEmail
        exclude = ["html"]
        display_field = "subject"


class DeliveryAttemptSerializer(BaseSerializer):
    class Meta:
        model = DeliveryAttempt
        display_field = "kind"
