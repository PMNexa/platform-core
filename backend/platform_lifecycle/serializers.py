from core_api.serializers import BaseSerializer

from platform_lifecycle.models import LifecycleSend


class LifecycleSendSerializer(BaseSerializer):
    class Meta:
        model = LifecycleSend
        fields = ["id", "user_id", "journey", "step", "subject", "email", "holdout", "target", "sent_at",
                  "clicked_at", "converted_at", "unsubscribed_at"]
        display_field = "subject"
        extra_kwargs = {
            "holdout": {"help_text": "In the holdout: recorded, not sent - what the journey is measured against."},
            "target": {"help_text": "The action this step is for; converted = it followed within 72 hours."},
        }
