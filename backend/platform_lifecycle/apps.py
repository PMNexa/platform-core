from django.apps import AppConfig


class PlatformLifecycleConfig(AppConfig):
    """Lifecycle email - journeys, their scheduler and measurement - behind
    `core_api.lifecycle`. Needs `platform_system` (the outbox, settings,
    preferences). See that module."""

    name = "platform_lifecycle"
    default_auto_field = "django.db.models.BigAutoField"

    def ready(self):
        from core_api.system import (
            BOOL,
            INT,
            RetentionRule,
            SettingDef,
            register_export_provider,
            register_retention_rule,
            register_setting,
            user_removed,
        )
        from platform_system.preferences import unsubscribed

        group = "Lifecycle email"
        register_setting(SettingDef(
            "lifecycle.enabled", "Send lifecycle email", BOOL, default=False, group=group, env="LIFECYCLE_ENABLED",
            help="Onboarding, tips, milestones and win-back emails (System > Lifecycle email). Users can turn each "
                 "kind off. Needs PUBLIC_URL for the links.",
        ))
        register_setting(SettingDef(
            "lifecycle.frequency_cap", "Most emails per user per 7 days", INT, default=2, group=group,
            validate=_non_negative, help="Lifecycle emails only; a step over the cap waits. 0: no cap.",
        ))
        register_setting(SettingDef(
            "lifecycle.quiet_start", "Quiet hours start", INT, default=21, group=group, validate=_hour,
            help="Hour (0-23, the user's time zone) from which nothing is sent; it waits until quiet hours end.",
        ))
        register_setting(SettingDef(
            "lifecycle.quiet_end", "Quiet hours end", INT, default=8, group=group, validate=_hour,
            help="Hour (0-23) sending resumes. Same as the start: no quiet hours.",
        ))
        register_setting(SettingDef(
            "lifecycle.holdout_percent", "Holdout (%)", INT, default=10, group=group, validate=_percent,
            help="Share of new enrollments that get no email, to measure the journeys against. 0: none.",
        ))
        register_setting(SettingDef(
            "lifecycle.sunset_days", "Stop after inactive for (days)", INT, default=60, group=group,
            validate=_non_negative,
            help="No lifecycle email (except win-back) to someone inactive this long, until they're back. 0: never.",
        ))
        register_retention_rule(RetentionRule(
            "lifecycle_signals", "lifecycle signals", _purge_signals, default_days=90,
            help="What users did, kept to match emails with the actions that followed.",
        ))
        user_removed.connect(_forget_user, dispatch_uid="platform_lifecycle.user_removed")
        unsubscribed.connect(_unsubscribed, dispatch_uid="platform_lifecycle.unsubscribed")
        register_export_provider("lifecycle_email", _export)


def _non_negative(value):
    if int(value) < 0:
        raise ValueError("0 or more.")


def _hour(value):
    if not 0 <= int(value) <= 23:
        raise ValueError("An hour from 0 to 23.")


def _percent(value):
    if not 0 <= int(value) <= 50:
        raise ValueError("From 0 to 50.")


def _purge_signals(cutoff) -> int:
    from platform_lifecycle.models import Signal

    return Signal.objects.filter(at__lt=cutoff).delete()[0]


def _forget_user(sender, user_id, **kwargs):
    from platform_lifecycle.models import Enrollment, Signal

    Signal.objects.filter(user_id=str(user_id)).delete()
    Enrollment.objects.filter(user_id=str(user_id)).delete()


def _unsubscribed(sender, user_id, category, ref="", **kwargs):
    import uuid

    from django.utils import timezone

    from platform_lifecycle.models import LifecycleSend

    try:
        send_id = uuid.UUID(str(ref))
    except ValueError:
        return
    LifecycleSend.objects.filter(id=send_id, user_id=str(user_id), unsubscribed_at__isnull=True).update(
        unsubscribed_at=timezone.now()
    )


def _export(user_id):
    from platform_lifecycle.models import LifecycleSend

    return [
        {"journey": s.journey, "step": s.step, "subject": s.subject, "sent_at": s.sent_at.isoformat(),
         "holdout": s.holdout, "clicked_at": s.clicked_at and s.clicked_at.isoformat()}
        for s in LifecycleSend.objects.filter(user_id=str(user_id)).order_by("sent_at")
    ]
