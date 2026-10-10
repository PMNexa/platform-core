from django.apps import AppConfig


class PlatformSystemConfig(AppConfig):
    """Instance-wide services behind `core_api.system`: editable system
    settings, the audit log and the email outbox. See that module."""

    name = "platform_system"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from django.core.signals import request_started

        from core_api.system import (
            CHOICE,
            LIST,
            STRING,
            TEXT,
            SettingDef,
            register_export_provider,
            register_setting,
            user_removed,
        )
        from platform_system.store import invalidate

        request_started.connect(lambda **kwargs: invalidate(), weak=False, dispatch_uid="platform_system.settings")

        from platform_system.insights import register_builtins

        register_builtins()

        register_setting(SettingDef(
            "email.from_name", "Sender name", STRING, default="GoalNexa", group="Email",
            help="The name emails come from; the address itself is EMAIL_FROM.",
        ))
        register_setting(SettingDef(
            "email.reply_to", "Reply-to address", STRING, default="", group="Email",
            help="Where replies go - e.g. your support inbox. Empty: the sender address.",
        ))
        register_setting(SettingDef(
            "email.postal_address", "Postal address", TEXT, default="", group="Email",
            help="Shown at the bottom of every email a user can unsubscribe from (anti-spam laws ask for one).",
        ))
        register_setting(SettingDef(
            "email.ses_configuration_set", "Amazon SES configuration set", STRING, default="", group="Email",
            env="EMAIL_SES_CONFIGURATION_SET",
            help="Sent with every email (X-SES-CONFIGURATION-SET), so SES reports its bounces and complaints to the "
                 "set's SNS topic. Empty: not using SES events.",
        ))
        register_setting(SettingDef(
            "email.ses_topic_arns", "Amazon SNS topics for SES events", LIST, default=[], group="Email",
            env="EMAIL_SES_TOPIC_ARNS",
            help="ARNs of the SNS topics allowed to post bounces and complaints to /api/v1/email/ses-events. "
                 "Empty: none accepted.",
        ))
        user_removed.connect(_forget_user, dispatch_uid="platform_system.user_removed")
        register_export_provider("email_preferences", _export)
        register_setting(SettingDef(
            "system.announcement", "Announcement", TEXT, default="", group="Announcement",
            help="Shown at the top of every page for signed-in users - e.g. planned maintenance. Empty: none.",
        ))
        register_setting(SettingDef(
            "system.announcement_level", "Announcement style", CHOICE, default="info", group="Announcement",
            choices=[("info", "Information"), ("warning", "Warning"), ("danger", "Urgent")],
        ))


def _forget_user(sender, user_id, **kwargs):
    from platform_system.models import EmailPreference

    EmailPreference.objects.filter(user_id=str(user_id)).delete()


def _export(user_id):
    from platform_system.preferences import preferences

    return {"categories": {c["key"]: c["enabled"] for c in preferences(user_id)}}
