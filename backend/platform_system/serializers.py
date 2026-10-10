from core_api.serializers import BaseSerializer

from platform_system.models import AuditEvent, DeliveryAttempt, OutgoingEmail, Suppression, SystemSetting


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


class SuppressionSerializer(BaseSerializer):
    class Meta:
        model = Suppression
        fields = ["id", "email", "reason", "detail", "created_at"]
        read_only_fields = ["reason", "created_at"]
        display_field = "email"
        extra_kwargs = {
            "email": {"help_text": "Nothing is sent to this address, account mail included."},
            "detail": {"help_text": "Why - the bounce's diagnostic, or a note."},
        }
