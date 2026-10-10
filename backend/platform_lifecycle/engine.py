"""The lifecycle scheduler (`core_api.lifecycle` describes the model).

Each run (`run`, every few minutes from the host's job loop):

1. **Enter** - every journey's `enter` scan (at most every
   `SCAN_EVERY` per process); signal-triggered journeys enroll in
   `record` instead, as the signal happens.
2. **Send** - each enrollment whose step is due is claimed (a
   conditional UPDATE, so two schedulers never both take it), then goes
   through, in order: the journey's exit -> the user's account (gone,
   disabled, not yet confirmed) -> the sunset -> the category preference
   -> the suppression list -> the step's own condition (`render` returns
   None: skipped) -> holdout (recorded, not sent) -> frequency cap and
   quiet hours (postponed, not dropped) -> sent through the outbox.
3. **Attribute** - a send whose target signal followed within
   `CONVERSION_WINDOW` gets `converted_at`; holdout rows too.

Who a user is comes from the host (`settings.PLATFORM_LIFECYCLE_USERS`,
a dotted path to `fn(ids) -> {id: {"email", "name", "active", "ready",
"timezone"}}`): `ready` False (email not confirmed yet) holds the
journey back, for up to `NOT_READY_LIMIT`.
"""

from __future__ import annotations

import logging
import random
import time
from datetime import datetime, timedelta
from datetime import timezone as dt_timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import Count, Min, Q
from django.utils import timezone
from django.utils.module_loading import import_string

from core_api.lifecycle import (
    CONVERSION_WINDOW,
    SEEN,
    Enrolled,
    Journey,
    StepContext,
    get_journey,
    journeys,
)
from core_api.system import get_setting, last_seen, public_url

from platform_lifecycle import layout
from platform_lifecycle.models import Enrollment, EnrollmentStatus, LifecycleSend, Signal

logger = logging.getLogger(__name__)

BATCH = 200
#: How long a claimed enrollment is held before another run may retry it.
CLAIM = timedelta(minutes=10)
NOT_READY_LIMIT = timedelta(days=7)
CAP_WINDOW = timedelta(days=7)
SCAN_EVERY = 30 * 60

_last_scan = 0.0


def _setting(key: str, fallback):
    try:
        value = get_setting(key)
    except KeyError:
        return fallback
    return fallback if value is None or value == "" else value


def users(ids) -> dict[str, dict]:
    path = getattr(settings, "PLATFORM_LIFECYCLE_USERS", None)
    if not path or not ids:
        return {}
    return {str(k): v for k, v in import_string(path)(list(set(ids))).items()}


# --- entering ---------------------------------------------------------------


def record(user_id: str, name: str, data: dict) -> None:
    now = timezone.now()
    Signal.objects.create(user_id=user_id, name=name, data=data, at=now)
    for journey in journeys():
        if journey.trigger == name:
            enroll(journey, user_id, str(data.get("key", "")), data, now)


def enroll(journey: Journey, user_id: str, key: str, data: dict, now: datetime) -> bool:
    """Starts `journey` for the user unless (user, journey, key) ever did."""
    if not journey.steps:
        return False
    holdout = journey.holdout and random.random() * 100 < int(_setting("lifecycle.holdout_percent", 10))
    try:
        with transaction.atomic():
            _, created = Enrollment.objects.get_or_create(
                user_id=str(user_id), journey=journey.key, key=key[:128],
                defaults={"data": data, "holdout": holdout, "entered_at": now,
                          "next_at": now + journey.steps[0].delay},
            )
    except IntegrityError:
        return False
    return created


def scan(now: datetime, *, force: bool = False) -> int:
    global _last_scan
    if not force and time.monotonic() - _last_scan < SCAN_EVERY:
        return 0
    _last_scan = time.monotonic()
    entered = 0
    for journey in journeys():
        if journey.enter is None:
            continue
        try:
            for user_id, key, data in journey.enter(now):
                entered += enroll(journey, str(user_id), str(key), data or {}, now)
        except Exception:
            logger.exception("Lifecycle scan for %s failed", journey.key)
    return entered


# --- sending ------------------------------------------------------------------


def _end(enrollment: Enrollment, status: str, reason: str, now: datetime) -> str:
    Enrollment.objects.filter(id=enrollment.id).update(status=status, exit_reason=reason[:64], ended_at=now, next_at=None)
    return reason or status


def _later(enrollment: Enrollment, when: datetime) -> str:
    Enrollment.objects.filter(id=enrollment.id).update(next_at=when)
    return "postponed"


def _advance(enrollment: Enrollment, journey: Journey, now: datetime) -> None:
    step = enrollment.step + 1
    if step >= len(journey.steps):
        Enrollment.objects.filter(id=enrollment.id).update(step=step, status=EnrollmentStatus.DONE, ended_at=now,
                                                           next_at=None)
        return
    due = max(enrollment.entered_at + journey.steps[step].delay, now)
    Enrollment.objects.filter(id=enrollment.id).update(step=step, next_at=due)


def _zone(name: str):
    try:
        return ZoneInfo(name or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def quiet_until(now: datetime, zone_name: str) -> datetime | None:
    """When quiet hours (`lifecycle.quiet_start`-`quiet_end`, the user's
    local time) end, if `now` is inside them."""
    start, end = int(_setting("lifecycle.quiet_start", 21)), int(_setting("lifecycle.quiet_end", 8))
    if start == end:
        return None
    local = now.astimezone(_zone(zone_name))
    hour = local.hour
    quiet = (hour >= start or hour < end) if start > end else (start <= hour < end)
    if not quiet:
        return None
    day = local.date() + timedelta(days=1) if start > end and hour >= start else local.date()
    return datetime(day.year, day.month, day.day, end, tzinfo=local.tzinfo).astimezone(dt_timezone.utc)


def cap_until(user_id: str, now: datetime) -> datetime | None:
    """When the user may get the next email, if `lifecycle.frequency_cap`
    emails already went out in the last 7 days."""
    cap = int(_setting("lifecycle.frequency_cap", 2))
    if cap <= 0:
        return None
    window = LifecycleSend.objects.filter(user_id=user_id, holdout=False, email__isnull=False,
                                          sent_at__gt=now - CAP_WINDOW)
    stats = window.aggregate(n=Count("id"), first=Min("sent_at"))
    if stats["n"] < cap:
        return None
    return stats["first"] + CAP_WINDOW + timedelta(minutes=1)


def context(enrollment_or_none, user_id: str, user: dict, now: datetime, data=None) -> StepContext:
    return StepContext(
        user_id=user_id, name=user.get("name") or "", email=user.get("email") or "",
        data=data if data is not None else (enrollment_or_none.data if enrollment_or_none else {}),
        entered_at=enrollment_or_none.entered_at if enrollment_or_none else now, now=now,
    )


def deliver_message(journey: Journey, step_key: str, message, ctx: StepContext, send: LifecycleSend | None,
                    *, kind: str = ""):
    """Queues `message` for `ctx`'s user (or returns None: they turned the category off)."""
    from platform_system.mail import queue

    text, html = layout.render(message, ctx.first_name, f"{journey.key}.{step_key}", send.id if send else None)
    return queue([ctx.email], message.subject, text, html=html, kind=kind or f"lifecycle:{journey.key}.{step_key}",
                 user_id=ctx.user_id, category=journey.category, unsubscribe_ref=str(send.id) if send else "")


def process(enrollment: Enrollment, user: dict | None, seen_at, now: datetime) -> str:
    """One due enrollment, already claimed. Returns what happened."""
    from platform_system.mail import suppressed
    from platform_system.preferences import is_enabled

    journey = get_journey(enrollment.journey)
    if journey is None:
        return _end(enrollment, EnrollmentStatus.EXITED, "journey removed", now)
    if journey.exit:
        reason = journey.exit(
            Enrolled(enrollment.user_id, enrollment.key, enrollment.data, enrollment.entered_at), now
        )
        if reason:
            return _end(enrollment, EnrollmentStatus.EXITED, reason, now)
    if enrollment.step >= len(journey.steps):
        return _end(enrollment, EnrollmentStatus.DONE, "", now)
    if not user or not user.get("active", True) or not user.get("email"):
        return _end(enrollment, EnrollmentStatus.EXITED, "no account", now)
    if not user.get("ready", True):
        if now - enrollment.entered_at > NOT_READY_LIMIT:
            return _end(enrollment, EnrollmentStatus.EXITED, "never confirmed", now)
        return _later(enrollment, now + timedelta(hours=1))
    sunset = int(_setting("lifecycle.sunset_days", 60))
    if not journey.ignore_sunset and sunset and seen_at and now - seen_at > timedelta(days=sunset):
        return _end(enrollment, EnrollmentStatus.EXITED, "sunset", now)
    if not is_enabled(enrollment.user_id, journey.category):
        return _end(enrollment, EnrollmentStatus.EXITED, "unsubscribed", now)
    if suppressed([user["email"]]):
        return _end(enrollment, EnrollmentStatus.EXITED, "suppressed", now)

    step = journey.steps[enrollment.step]
    ctx = context(enrollment, enrollment.user_id, user, now)
    message = step.render(ctx)
    if message is None:
        _advance(enrollment, journey, now)
        return "skipped"
    if not enrollment.holdout:
        wait = cap_until(enrollment.user_id, now) or quiet_until(now, user.get("timezone") or "UTC")
        if wait:
            return _later(enrollment, wait)
    try:
        with transaction.atomic():
            send = LifecycleSend.objects.create(
                enrollment=enrollment, user_id=enrollment.user_id, journey=journey.key, step=step.key,
                subject=message.subject[:255], holdout=enrollment.holdout, target=step.target, sent_at=now,
            )
    except IntegrityError:
        _advance(enrollment, journey, now)  # another run did this step already
        return "duplicate"
    if not enrollment.holdout:
        email = deliver_message(journey, step.key, message, ctx, send)
        if email is not None:
            LifecycleSend.objects.filter(id=send.id).update(email=email)
    _advance(enrollment, journey, now)
    return "holdout" if enrollment.holdout else "sent"


def send_due(now: datetime) -> dict:
    due = list(
        Enrollment.objects.filter(status=EnrollmentStatus.ACTIVE, next_at__lte=now).order_by("next_at")[:BATCH]
    )
    if not due:
        return {}
    ids = [e.user_id for e in due]
    directory, seen = users(ids), last_seen(ids)
    outcomes: dict[str, int] = {}
    for enrollment in due:
        claimed = Enrollment.objects.filter(
            id=enrollment.id, status=EnrollmentStatus.ACTIVE, next_at=enrollment.next_at
        ).update(next_at=now + CLAIM)
        if not claimed:
            continue
        try:
            outcome = process(enrollment, directory.get(enrollment.user_id), seen.get(enrollment.user_id), now)
        except Exception:
            logger.exception("Lifecycle step for enrollment %s failed", enrollment.id)
            outcome = "failed"  # retried once the claim lapses
        outcomes[outcome] = outcomes.get(outcome, 0) + 1
    return outcomes


# --- attribution (P-45) -------------------------------------------------------


def attribute(now: datetime) -> int:
    """Stamps `converted_at` on sends whose target action followed in time."""
    pending = list(
        LifecycleSend.objects.filter(converted_at__isnull=True, sent_at__gte=now - CONVERSION_WINDOW - timedelta(hours=1))
        .exclude(target="")[:2000]
    )
    if not pending:
        return 0
    seen = last_seen({s.user_id for s in pending if s.target == SEEN})
    converted = 0
    for send in pending:
        end = send.sent_at + CONVERSION_WINDOW
        if send.target == SEEN:
            at = seen.get(send.user_id)
            at = at if at and send.sent_at < at <= end else None
        else:
            at = (
                Signal.objects.filter(user_id=send.user_id, name=send.target, at__gt=send.sent_at, at__lte=end)
                .order_by("at").values_list("at", flat=True).first()
            )
        if at:
            converted += LifecycleSend.objects.filter(id=send.id, converted_at__isnull=True).update(converted_at=at)
    return converted


def run(now: datetime | None = None) -> dict:
    now = now or timezone.now()
    if not public_url():
        logger.warning("Lifecycle email is on but PUBLIC_URL isn't set - nothing sent (links need it).")
        return {}
    entered = scan(now)
    outcomes = send_due(now)
    result = {"lifecycle_entered": entered, "lifecycle_sent": outcomes.get("sent", 0),
              "lifecycle_converted": attribute(now)}
    return {k: v for k, v in result.items() if v}


# --- the console (P-43 / P-45) -----------------------------------------------


def overview(days: int) -> dict:
    """Every journey with its steps' numbers over the last `days` days:
    sent, clicked, converted, unsubscribed - and the holdout's count and
    conversions beside them - plus enrollments by status."""
    since = timezone.now() - timedelta(days=days)
    rows = (
        LifecycleSend.objects.filter(sent_at__gte=since)
        .values("journey", "step")
        .annotate(
            sent=Count("id", filter=Q(holdout=False, email__isnull=False)),
            clicked=Count("id", filter=Q(holdout=False, clicked_at__isnull=False)),
            converted=Count("id", filter=Q(holdout=False, converted_at__isnull=False)),
            unsubscribed=Count("id", filter=Q(holdout=False, unsubscribed_at__isnull=False)),
            # Not named "holdout": an annotation by a field's name shadows the field in later filters.
            held=Count("id", filter=Q(holdout=True)),
            held_converted=Count("id", filter=Q(holdout=True, converted_at__isnull=False)),
        )
    )
    numbers = {
        (r["journey"], r["step"]): {**r, "holdout": r["held"], "holdout_converted": r["held_converted"]} for r in rows
    }
    statuses = (
        Enrollment.objects.filter(entered_at__gte=since).values("journey", "status").annotate(n=Count("id"))
    )
    enrollments: dict[str, dict] = {}
    for row in statuses:
        enrollments.setdefault(row["journey"], {})[row["status"]] = row["n"]
    active = Enrollment.objects.filter(status=EnrollmentStatus.ACTIVE).values("journey").annotate(n=Count("id"))
    for row in active:
        enrollments.setdefault(row["journey"], {})["active_now"] = row["n"]
    empty = {"sent": 0, "clicked": 0, "converted": 0, "unsubscribed": 0, "holdout": 0, "holdout_converted": 0}
    return {
        "days": days,
        "journeys": [
            {
                "key": j.key,
                "label": j.label,
                "description": j.description,
                "category": j.category,
                "trigger": j.trigger,
                "scan": j.enter is not None,
                "enrollments": enrollments.get(j.key, {}),
                "steps": [
                    {
                        "key": s.key,
                        "label": s.label or s.key,
                        "target": s.target,
                        "delay_hours": round(s.delay.total_seconds() / 3600, 1),
                        **{k: v for k, v in numbers.get((j.key, s.key), empty).items() if k in empty},
                    }
                    for s in j.steps
                ],
            }
            for j in journeys()
        ],
    }
