"""The admin's Status page: scheduler heartbeats, delivery numbers, and
every module's usage numbers (`core_api.system.register_usage_provider`)."""

import logging
from datetime import timedelta

from django.db.models import Count, F, Q
from django.utils import timezone

from core_api.system import usage_providers

from platform_system.models import DeliveryAttempt, EmailStatus, JobHeartbeat, OutgoingEmail

logger = logging.getLogger(__name__)

#: A job that hasn't run for this long is flagged as stopped.
STALE_AFTER = timedelta(minutes=20)


def record_heartbeat(name: str, *, ok: bool, error: str, result: dict) -> None:
    now = timezone.now()
    updated = JobHeartbeat.objects.filter(name=name).update(
        last_run_at=now,
        last_ok_at=now if ok else F("last_ok_at"),
        last_error="" if ok else error[:2000],
        last_result=result,
        runs=F("runs") + 1,
        failures=F("failures") + (0 if ok else 1),
    )
    if not updated:
        JobHeartbeat.objects.create(
            name=name, last_run_at=now, last_ok_at=now if ok else None, last_error="" if ok else error[:2000],
            last_result=result, runs=1, failures=0 if ok else 1,
        )


def status() -> dict:
    now = timezone.now()
    day = now - timedelta(days=1)
    jobs = [
        {
            "name": job.name,
            "last_run_at": job.last_run_at,
            "last_ok_at": job.last_ok_at,
            "last_error": job.last_error,
            "last_result": job.last_result,
            "runs": job.runs,
            "failures": job.failures,
            "state": "stopped" if now - job.last_run_at > STALE_AFTER else "failing" if job.last_error else "ok",
        }
        for job in JobHeartbeat.objects.order_by("name")
    ]
    emails = OutgoingEmail.objects.filter(created_at__gte=day).aggregate(
        sent=Count("id", filter=Q(status=EmailStatus.SENT)),
        failed=Count("id", filter=Q(status=EmailStatus.FAILED)),
    )
    emails["queued"] = OutgoingEmail.objects.filter(status=EmailStatus.QUEUED).count()
    notifications = DeliveryAttempt.objects.filter(created_at__gte=day).aggregate(
        sent=Count("id", filter=Q(ok=True)), failed=Count("id", filter=Q(ok=False))
    )
    usage = []
    for provider in usage_providers():
        try:
            usage.append({"group": provider.group, "rows": provider.rows()})
        except Exception:
            logger.exception("Usage provider %s failed", provider.group)
            usage.append({"group": provider.group, "rows": [{"label": "Error", "value": "couldn't compute"}]})
    return {"jobs": jobs, "emails_24h": emails, "notifications_24h": notifications, "usage": usage}
