from django.db import models
from django.utils import timezone

from core_api.utils import generate_uuid7


class Signal(models.Model):
    """Something a user did (`core_api.lifecycle.record_signal`) - what
    conversions are matched against. Append-only, purged by the
    `retention.lifecycle_signals_days` rule. A bare user id."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    user_id = models.CharField(max_length=64)
    name = models.CharField(max_length=64)
    data = models.JSONField(default=dict, blank=True)
    at = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = "lifecycle_signal"
        indexes = [models.Index(fields=["user_id", "name", "at"]), models.Index(fields=["at"])]


class EnrollmentStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    DONE = "done", "Done"
    EXITED = "exited", "Exited"


class Enrollment(models.Model):
    """A user in a journey: `step` is the index of the next step, due at
    `next_at`. One per (user, journey, key) ever - `key` tells repeatable
    entries apart (a goal's milestone, one spell of inactivity). In the
    holdout, nothing is sent but each step is still recorded."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    user_id = models.CharField(max_length=64)
    journey = models.CharField(max_length=64)
    key = models.CharField(max_length=128, blank=True, default="")
    data = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=8, choices=EnrollmentStatus.choices, default=EnrollmentStatus.ACTIVE)
    step = models.PositiveSmallIntegerField(default=0)
    next_at = models.DateTimeField(null=True, blank=True)
    holdout = models.BooleanField(default=False)
    entered_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True)
    exit_reason = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        db_table = "lifecycle_enrollment"
        constraints = [
            models.UniqueConstraint(fields=["user_id", "journey", "key"], name="lifecycle_enrollment_unique"),
        ]
        indexes = [models.Index(fields=["status", "next_at"]), models.Index(fields=["journey", "entered_at"])]


class LifecycleSend(models.Model):
    """One step of an enrollment, done: the email (none in the holdout),
    and what followed - a click on its button, its target action within
    72 hours (`converted_at`), an unsubscribe from its link."""

    id = models.UUIDField(primary_key=True, default=generate_uuid7, editable=False)
    enrollment = models.ForeignKey(Enrollment, on_delete=models.CASCADE, related_name="sends")
    user_id = models.CharField(max_length=64, db_index=True)
    journey = models.CharField(max_length=64)
    step = models.CharField(max_length=64)
    subject = models.CharField(max_length=255, blank=True, default="")
    email = models.ForeignKey(
        "platform_system.OutgoingEmail", null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    holdout = models.BooleanField(default=False)
    target = models.CharField(max_length=64, blank=True, default="")
    sent_at = models.DateTimeField(default=timezone.now, db_index=True)
    clicked_at = models.DateTimeField(null=True, blank=True)
    converted_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "lifecycle_send"
        verbose_name = "lifecycle email"
        verbose_name_plural = "lifecycle emails"
        constraints = [models.UniqueConstraint(fields=["enrollment", "step"], name="lifecycle_send_unique")]
        indexes = [models.Index(fields=["journey", "step", "sent_at"])]

    def __str__(self):
        return self.subject or f"{self.journey}.{self.step}"
