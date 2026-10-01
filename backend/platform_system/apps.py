from django.apps import AppConfig


class PlatformSystemConfig(AppConfig):
    """Instance-wide services behind `core_api.system`: editable system
    settings, the audit log and the email outbox. See that module."""

    name = "platform_system"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from django.core.signals import request_started

        from core_api.system import CHOICE, STRING, TEXT, SettingDef, register_setting
        from platform_system.store import invalidate

        request_started.connect(lambda **kwargs: invalidate(), weak=False, dispatch_uid="platform_system.settings")

        register_setting(SettingDef(
            "email.from_name", "Sender name", STRING, default="GoalNexa", group="Email",
            help="The name emails come from; the address itself is EMAIL_FROM.",
        ))
        register_setting(SettingDef(
            "email.reply_to", "Reply-to address", STRING, default="", group="Email",
            help="Where replies go - e.g. your support inbox. Empty: the sender address.",
        ))
        register_setting(SettingDef(
            "system.announcement", "Announcement", TEXT, default="", group="Announcement",
            help="Shown at the top of every page for signed-in users - e.g. planned maintenance. Empty: none.",
        ))
        register_setting(SettingDef(
            "system.announcement_level", "Announcement style", CHOICE, default="info", group="Announcement",
            choices=[("info", "Information"), ("warning", "Warning"), ("danger", "Urgent")],
        ))
