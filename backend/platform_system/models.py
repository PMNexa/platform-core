from django.db import models
from django.utils import timezone

from core_api.utils import generate_uuid7


class SystemSetting(models.Model):
    """A system setting saved from the admin page - only editable ones,
    and only those whose env variable isn't set (`core_api.system`).
    `value` is the parsed value, as JSON. `updated_by` is a bare user id."""

    key = models.CharField(max_length=100, primary_key=True)
    value = models.JSONField(null=True)
    updated_by = models.CharField(max_length=64, blank=True, default="")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "system_setting"


class AuditEvent(models.Model):
    """A security-relevant event, append-only (`core_api.system.audit`).
    Who (`actor_id`, plus their email at the time - it outlives the
    account), what (`action`, e.g. "user.disabled"), on what (`target_*`),
    from where (`ip`, `user_agent`), and details (`data`)."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    actor_id = models.CharField(max_length=64, blank=True, default="")
    actor_email = models.CharField(max_length=255, blank=True, default="")
    action = models.CharField(max_length=64, db_index=True)
    target_type = models.CharField(max_length=64, blank=True, default="")
    target_id = models.CharField(max_length=64, blank=True, default="")
    target_label = models.CharField(max_length=255, blank=True, default="")
    ip = models.CharField(max_length=64, blank=True, default="")
    user_agent = models.CharField(max_length=255, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "audit_event"
        verbose_name = "audit event"


class EmailStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    SENT = "sent", "Sent"
    FAILED = "failed", "Failed"
    #: Not sent: every recipient is on the suppression list.
    SUPPRESSED = "suppressed", "Suppressed"


class OutgoingEmail(models.Model):
    """The email outbox (`platform_system.mail`): every message, sent
    right after the transaction that queued it commits, retried with
    backoff by `run_system_jobs` until `MAX_ATTEMPTS`. Also the delivery
    log. `kind` says what it was ("password_reset", "invitation", ...)."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    to = models.JSONField(default=list)
    subject = models.CharField(max_length=255)
    text = models.TextField()
    html = models.TextField(blank=True, default="")
    kind = models.CharField(max_length=64, blank=True, default="")
    user_id = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=16, choices=EmailStatus.choices, default=EmailStatus.QUEUED, db_index=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    last_error = models.TextField(blank=True, default="")
    sent_at = models.DateTimeField(null=True, blank=True)
    #: The email category it was sent under ("" = account mail, always sent).
    category = models.CharField(max_length=32, blank=True, default="", db_default="")
    #: Extra headers (List-Unsubscribe, ...); null on older rows.
    headers = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "outgoing_email"
        verbose_name = "outgoing email"
        verbose_name_plural = "outgoing emails"


class JobHeartbeat(models.Model):
    """The last run of a periodic job (`core_api.system.heartbeat`)."""

    name = models.CharField(max_length=100, primary_key=True)
    last_run_at = models.DateTimeField()
    last_ok_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    last_result = models.JSONField(default=dict, blank=True)
    runs = models.PositiveIntegerField(default=0)
    failures = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = "job_heartbeat"


class DeliveryAttempt(models.Model):
    """A notification sent outside the email outbox - an Apprise reminder,
    digest, ... (`core_api.system.log_delivery`). `target` is only the
    service (a URL scheme), never the URL - those carry tokens."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    channel = models.CharField(max_length=32)
    kind = models.CharField(max_length=64, blank=True, default="")
    user_id = models.CharField(max_length=64, blank=True, default="")
    target = models.CharField(max_length=255, blank=True, default="")
    ok = models.BooleanField(default=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "delivery_attempt"
        verbose_name = "notification"
        verbose_name_plural = "notifications"


class UserPresence(models.Model):
    """When a user was last active (`core_api.system.seen`), overall and
    per channel - the website or an AI assistant. A bare user id."""

    user_id = models.CharField(max_length=64, primary_key=True)
    last_seen_at = models.DateTimeField(db_index=True)
    last_web_at = models.DateTimeField(null=True, blank=True)
    last_agent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "user_presence"


class UserDay(models.Model):
    """One row per user per day they were active (in UTC), with the
    channels they used - what active-user counts and cohorts are built from."""

    user_id = models.CharField(max_length=64)
    date = models.DateField(db_index=True)
    web = models.BooleanField(default=False)
    agent = models.BooleanField(default=False)

    class Meta:
        db_table = "user_day"
        constraints = [models.UniqueConstraint(fields=["user_id", "date"], name="user_day_unique")]


class DailyStat(models.Model):
    """An Insights number (`core_api.system.InsightSeries`) at the end of a day."""

    date = models.DateField()
    key = models.CharField(max_length=100)
    value = models.FloatField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "daily_stat"
        constraints = [models.UniqueConstraint(fields=["key", "date"], name="daily_stat_unique")]
        indexes = [models.Index(fields=["date"])]


class EventCount(models.Model):
    """Events counted per day (`core_api.system.count`): how many, how many
    failed, total time, and a latency histogram (`hist`: bucket upper bound
    in ms -> count) for percentiles."""

    date = models.DateField()
    kind = models.CharField(max_length=32)
    key = models.CharField(max_length=200)
    count = models.PositiveIntegerField(default=0)
    errors = models.PositiveIntegerField(default=0)
    total_ms = models.FloatField(default=0)
    hist = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "event_count"
        constraints = [models.UniqueConstraint(fields=["date", "kind", "key"], name="event_count_unique")]
        indexes = [models.Index(fields=["kind", "date"])]


class SuppressionReason(models.TextChoices):
    BOUNCE = "bounce", "Hard bounce"
    COMPLAINT = "complaint", "Complaint"
    MANUAL = "manual", "Added by an admin"


class Suppression(models.Model):
    """An address nothing is sent to any more - not even account mail:
    it bounced for good or its owner marked a message as spam (from SES
    through SNS, `platform_system.ses`), or an admin added it. Every
    `send_email` checks it. Removing the row lets mail through again."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    email = models.EmailField(max_length=255, unique=True)
    reason = models.CharField(max_length=16, choices=SuppressionReason.choices, default=SuppressionReason.MANUAL)
    #: Where it came from - the bounce's diagnostic, "admin", ...
    detail = models.CharField(max_length=500, blank=True, default="")
    created_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        db_table = "email_suppression"
        verbose_name = "suppressed address"
        verbose_name_plural = "suppressed addresses"

    def __str__(self):
        return self.email


class EmailPreference(models.Model):
    """A user's choice for one email category (`core_api.system.EmailCategory`);
    no row = the category's default. A bare user id."""

    user_id = models.CharField(max_length=64)
    category = models.CharField(max_length=32)
    enabled = models.BooleanField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "email_preference"
        constraints = [models.UniqueConstraint(fields=["user_id", "category"], name="email_preference_unique")]
