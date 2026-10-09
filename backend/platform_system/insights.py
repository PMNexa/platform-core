"""The admin's Insights page (`/system/insights`) and what feeds it - see
`core_api.system`'s "insights" and "data retention" parts.

- `record_seen`: a user's activity (`UserPresence`, `UserDay`), written at
  most hourly per user and channel per process.
- `record_count`: events counted per day (`EventCount`), buffered in the
  process and flushed every few seconds (and by the scheduler).
- `run_daily`: called by `run_system_jobs` - writes every
  `InsightSeries`' daily value (`DailyStat`; backfilled the first time,
  today's refreshed hourly) and applies the retention rules once a day.
- `insights(days)`: the page - every series over the range (and the one
  before it, for the change) plus every `InsightSection`.
"""

from __future__ import annotations

import atexit
import csv
import io
import logging
import os
import threading
import time
from datetime import date, datetime, timedelta
from datetime import timezone as dt_timezone

from django.conf import settings
from django.db import IntegrityError, connection, transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from core_api.system import (
    AGENT,
    InsightSection,
    InsightSeries,
    RetentionRule,
    get_setting,
    insight_sections,
    insight_series,
    retention_rules,
)

from platform_system.models import (
    AuditEvent,
    DailyStat,
    DeliveryAttempt,
    EmailStatus,
    EventCount,
    JobHeartbeat,
    OutgoingEmail,
    UserDay,
    UserPresence,
)

logger = logging.getLogger(__name__)

#: `seen` writes at most this often per user and channel (per process).
SEEN_EVERY = timedelta(hours=1)
#: Buffered counts are written at least this often (seconds).
FLUSH_EVERY = 15
#: Latency histogram buckets: upper bounds in ms (the last one catches the rest).
BUCKETS = (5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000)
#: How far back a new series is filled in, and the longest range the page shows.
BACKFILL_DAYS = 90
MAX_DAYS = 90
#: Today's values are recomputed this often.
REFRESH_EVERY = timedelta(hours=1)
RETENTION_JOB = "data_retention"


def today() -> date:
    return timezone.now().date()


# --- activity ------------------------------------------------------------

_seen_lock = threading.Lock()
_seen: dict[tuple[str, str], datetime] = {}


def forget_seen() -> None:
    """Drops the per-process write gate (tests)."""
    with _seen_lock:
        _seen.clear()


def record_seen(user_id: str, channel: str) -> None:
    now = timezone.now()
    with _seen_lock:
        last = _seen.get((user_id, channel))
        if last is not None and now - last < SEEN_EVERY and last.date() == now.date():
            return
        _seen[(user_id, channel)] = now
    field = "last_agent_at" if channel == AGENT else "last_web_at"
    flag = "agent" if channel == AGENT else "web"
    if not UserPresence.objects.filter(user_id=user_id).update(last_seen_at=now, **{field: now}):
        try:
            with transaction.atomic():
                UserPresence.objects.create(user_id=user_id, last_seen_at=now, **{field: now})
        except IntegrityError:
            UserPresence.objects.filter(user_id=user_id).update(last_seen_at=now, **{field: now})
    if not UserDay.objects.filter(user_id=user_id, date=now.date()).update(**{flag: True}):
        try:
            with transaction.atomic():
                UserDay.objects.create(user_id=user_id, date=now.date(), **{flag: True})
        except IntegrityError:
            UserDay.objects.filter(user_id=user_id, date=now.date()).update(**{flag: True})


def active_users(end: date, days: int) -> int:
    """Users active in the `days` days ending on `end`."""
    return UserDay.objects.filter(date__gt=end - timedelta(days=days), date__lte=end).values("user_id").distinct().count()


# --- counters ------------------------------------------------------------

_count_lock = threading.Lock()
_buffer: dict[tuple[date, str, str], list] = {}
_last_flush = time.monotonic()


def _bucket(ms: float) -> str:
    for bound in BUCKETS:
        if ms <= bound:
            return str(bound)
    return "inf"


def record_count(kind: str, key: str, *, ok: bool, ms: float | None) -> None:
    global _last_flush
    entry_key = (today(), kind[:32], key[:200])
    with _count_lock:
        entry = _buffer.setdefault(entry_key, [0, 0, 0.0, {}])
        entry[0] += 1
        if not ok:
            entry[1] += 1
        if ms is not None:
            entry[2] += ms
            bucket = _bucket(ms)
            entry[3][bucket] = entry[3].get(bucket, 0) + 1
        due = time.monotonic() - _last_flush >= FLUSH_EVERY
    if due:
        flush_counts()


def flush_counts() -> int:
    """Writes the buffered counts; returns how many rows it touched."""
    global _buffer, _last_flush
    with _count_lock:
        pending, _buffer = _buffer, {}
        _last_flush = time.monotonic()
    for (day, kind, key), (n, errors, total_ms, hist) in pending.items():
        for _attempt in range(2):
            try:
                with transaction.atomic():
                    row, _ = EventCount.objects.select_for_update().get_or_create(date=day, kind=kind, key=key)
                    row.count += n
                    row.errors += errors
                    row.total_ms += total_ms
                    merged = dict(row.hist or {})
                    for bucket, value in hist.items():
                        merged[bucket] = merged.get(bucket, 0) + value
                    row.hist = merged
                    row.save()
                break
            except IntegrityError:  # created by another process meanwhile - try again
                continue
    return len(pending)


def _flush_at_exit():
    try:
        flush_counts()
    except Exception:  # the database may already be gone
        pass


atexit.register(_flush_at_exit)


def counted_on(kind: str, day: date) -> tuple[int, int]:
    totals = EventCount.objects.filter(kind=kind, date=day).aggregate(n=Sum("count"), errors=Sum("errors"))
    return totals["n"] or 0, totals["errors"] or 0


def percentile(hist: dict, q: float) -> float | None:
    """The bucket bound below which `q` of the timed events fall (ms)."""
    total = sum(hist.values())
    if not total:
        return None
    seen = 0
    for bound in [*BUCKETS, "inf"]:
        seen += hist.get(str(bound), 0)
        if seen >= q * total:
            return float("inf") if bound == "inf" else float(bound)
    return None


def merged_hist(rows) -> dict:
    out: dict = {}
    for hist in rows:
        for bucket, value in (hist or {}).items():
            out[bucket] = out.get(bucket, 0) + value
    return out


def format_ms(value: float | None) -> str:
    if value is None:
        return "—"
    if value == float("inf"):
        return f"> {BUCKETS[-1] / 1000:g} s"
    return f"≤ {value:g} ms" if value < 1000 else f"≤ {value / 1000:g} s"


# --- daily job: snapshots + retention ----------------------------------------


def _end_of(day: date) -> datetime:
    return datetime.combine(day + timedelta(days=1), datetime.min.time(), tzinfo=dt_timezone.utc)


def snapshot_series(now: datetime | None = None) -> int:
    """Writes each series' missing days (back to `BACKFILL_DAYS`), finalizes
    yesterday once, and refreshes today hourly. Returns rows written."""
    now = now or timezone.now()
    day = now.date()
    start = day - timedelta(days=BACKFILL_DAYS - 1)
    written = 0
    for series in insight_series():
        rows = {row.date: row for row in DailyStat.objects.filter(key=series.key, date__gte=start)}
        due = [d for d in (start + timedelta(days=i) for i in range(BACKFILL_DAYS - 1)) if d not in rows]
        yesterday = day - timedelta(days=1)
        if yesterday in rows and rows[yesterday].updated_at < _end_of(yesterday):
            due.append(yesterday)
        if day not in rows or now - rows[day].updated_at >= REFRESH_EVERY:
            due.append(day)
        for d in sorted(set(due)):
            try:
                value = float(series.compute(d) or 0)
            except Exception:
                logger.exception("Insight series %s failed for %s", series.key, d)
                break
            DailyStat.objects.update_or_create(key=series.key, date=d, defaults={"value": value})
            written += 1
    return written


def apply_retention() -> dict:
    """Deletes what each retention rule's setting says is too old."""
    deleted = {}
    for rule in retention_rules():
        days = int(get_setting(f"retention.{rule.name}_days") or 0)
        if days <= 0:
            continue
        try:
            deleted[rule.name] = rule.purge(timezone.now() - timedelta(days=days))
        except Exception:
            logger.exception("Retention %s failed", rule.name)
    return deleted


def run_daily() -> dict:
    """`run_system_jobs`' share: counts, series, and retention once a day."""
    from platform_system.ops import record_heartbeat

    result = {"counts_flushed": flush_counts(), "stats_written": snapshot_series()}
    last = JobHeartbeat.objects.filter(name=RETENTION_JOB).values_list("last_ok_at", flat=True).first()
    if last is None or last.date() < today():
        try:
            deleted = apply_retention()
            record_heartbeat(RETENTION_JOB, ok=True, error="", result=deleted)
            result["rows_deleted"] = sum(deleted.values())
        except Exception as exc:
            record_heartbeat(RETENTION_JOB, ok=False, error=str(exc), result={})
    return result


# --- the page ------------------------------------------------------------


def clamp_days(raw) -> int:
    try:
        days = int(raw)
    except (TypeError, ValueError):
        days = 30
    return max(1, min(MAX_DAYS, days))


def insights(days: int) -> dict:
    flush_counts()  # this process's latest counts (other workers' follow within FLUSH_EVERY)
    end = today()
    start = end - timedelta(days=days - 1)
    since = start - timedelta(days=days)  # the previous period too, for the change
    stats: dict[str, list] = {}
    for row in DailyStat.objects.filter(date__gte=since, date__lte=end).order_by("date"):
        stats.setdefault(row.key, []).append([row.date.isoformat(), row.value])
    series = [
        {
            "key": s.key, "label": s.label, "group": s.group, "help": s.help, "kind": s.kind, "unit": s.unit,
            "points": stats.get(s.key, []),
        }
        for s in insight_series()
    ]
    sections = []
    for section in insight_sections():
        try:
            blocks = section.build(days)
        except Exception:
            logger.exception("Insight section %s failed", section.key)
            blocks = [{"kind": "tiles", "items": [{"label": "Error", "value": "couldn't compute"}]}]
        sections.append({"key": section.key, "title": section.title, "description": section.description, "blocks": blocks})
    return {
        "days": days, "start": start.isoformat(), "end": end.isoformat(), "previous_start": since.isoformat(),
        "series": series, "sections": sections,
    }


def insights_csv(days: int) -> str:
    end = today()
    start = end - timedelta(days=days - 1)
    defs = insight_series()
    values = {(row.key, row.date): row.value for row in DailyStat.objects.filter(date__gte=start, date__lte=end)}
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["date", *[s.key for s in defs]])
    for i in range(days):
        d = start + timedelta(days=i)
        writer.writerow([d.isoformat(), *["" if (s.key, d) not in values else f"{values[(s.key, d)]:g}" for s in defs]])
    return out.getvalue()


# --- built-in series, sections and retention rules -----------------------------


def _range(days: int) -> tuple[datetime, date, date]:
    end = today()
    start = end - timedelta(days=days - 1)
    return datetime.combine(start, datetime.min.time(), tzinfo=dt_timezone.utc), start, end


def _pct(part: float, whole: float) -> str:
    return "—" if not whole else f"{100 * part / whole:.0f}%"


def database_size() -> str:
    try:
        if connection.vendor == "postgresql":
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_database_size(current_database())")
                size = cursor.fetchone()[0]
        elif connection.vendor == "sqlite":
            size = os.path.getsize(settings.DATABASES["default"]["NAME"])
        else:
            return "—"
    except Exception:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if size < 1024 or unit == "GB":
            return f"{size:.0f} {unit}" if unit == "B" else f"{size:.1f} {unit}"
        size /= 1024
    return "—"


def _active_users_section(days: int) -> list[dict]:
    _, start, end = _range(days)
    day_rows = UserDay.objects.filter(date__gte=start, date__lte=end).values("user_id").annotate(
        web=Count("id", filter=Q(web=True)), agent=Count("id", filter=Q(agent=True))
    )
    web_only = sum(1 for r in day_rows if r["web"] and not r["agent"])
    agent_only = sum(1 for r in day_rows if r["agent"] and not r["web"])
    both = sum(1 for r in day_rows if r["web"] and r["agent"])
    dau, wau, mau = active_users(end, 1), active_users(end, 7), active_users(end, 30)
    return [
        {"kind": "tiles", "items": [
            {"label": "Active today", "value": dau},
            {"label": "Active, last 7 days", "value": wau},
            {"label": "Active, last 30 days", "value": mau},
            {"label": "Stickiness", "value": _pct(dau, mau), "hint": "Active today / active in 30 days"},
        ]},
        {"kind": "tiles", "title": f"By channel, last {days} days", "items": [
            {"label": "Website only", "value": web_only},
            {"label": "AI assistant only", "value": agent_only},
            {"label": "Both", "value": both},
        ]},
    ]


def _quality_section(days: int) -> list[dict]:
    since, start, end = _range(days)
    http = list(EventCount.objects.filter(kind="http", date__gte=start, date__lte=end).values("key", "count", "errors", "hist"))
    by_endpoint: dict[str, dict] = {}
    for row in http:
        entry = by_endpoint.setdefault(row["key"], {"count": 0, "errors": 0, "hists": []})
        entry["count"] += row["count"]
        entry["errors"] += row["errors"]
        entry["hists"].append(row["hist"])
    requests = sum(e["count"] for e in by_endpoint.values())
    errors = sum(e["errors"] for e in by_endpoint.values())
    overall = merged_hist(h for e in by_endpoint.values() for h in e["hists"])
    rate_limited = EventCount.objects.filter(kind="rate_limit", date__gte=start, date__lte=end).aggregate(n=Sum("count"))["n"] or 0
    audits = AuditEvent.objects.filter(created_at__gte=since)
    failed_logins = audits.filter(action="auth.login_failed").count()
    lockouts = audits.filter(action="auth.account_locked").count()

    endpoint_rows = []
    for key, e in sorted(by_endpoint.items(), key=lambda kv: -kv[1]["count"])[:25]:
        hist = merged_hist(e["hists"])
        endpoint_rows.append([
            key, e["count"], {"text": _pct(e["errors"], e["count"]), "heat": min(1, 5 * e["errors"] / e["count"]) if e["count"] else 0},
            format_ms(percentile(hist, 0.5)), format_ms(percentile(hist, 0.95)),
        ])

    tools = EventCount.objects.filter(kind="mcp.tool", date__gte=start, date__lte=end).values("key").annotate(
        n=Sum("count"), failed=Sum("errors")
    ).order_by("-n")
    mcp_calls = sum(t["n"] for t in tools)
    top = tools[0]["n"] if tools else 0

    deliveries = []
    for i in range(days - 1, -1, -1):
        d = end - timedelta(days=i)
        lo, hi = datetime.combine(d, datetime.min.time(), tzinfo=dt_timezone.utc), _end_of(d)
        emails = OutgoingEmail.objects.filter(created_at__gte=lo, created_at__lt=hi).aggregate(
            sent=Count("id", filter=Q(status=EmailStatus.SENT)), failed=Count("id", filter=Q(status=EmailStatus.FAILED))
        )
        notes = DeliveryAttempt.objects.filter(created_at__gte=lo, created_at__lt=hi).aggregate(
            delivered=Count("id", filter=Q(ok=True)), failed=Count("id", filter=Q(ok=False))
        )
        total = emails["sent"] + emails["failed"] + notes["delivered"] + notes["failed"]
        if total:
            good = emails["sent"] + notes["delivered"]
            deliveries.append([d.isoformat(), emails["sent"], emails["failed"], notes["delivered"], notes["failed"],
                               {"text": _pct(good, total), "bar": good / total}])

    jobs = []
    for row in EventCount.objects.filter(kind="job", date__gte=start, date__lte=end).values("key").annotate(
        n=Sum("count"), failed=Sum("errors"), ms=Sum("total_ms")
    ).order_by("key"):
        hist = merged_hist(EventCount.objects.filter(kind="job", key=row["key"], date__gte=start, date__lte=end).values_list("hist", flat=True))
        jobs.append([row["key"], row["n"], row["failed"], f"{row['ms'] / row['n']:.0f} ms" if row["n"] else "—", format_ms(percentile(hist, 0.95))])

    return [
        {"kind": "tiles", "items": [
            {"label": "API requests", "value": requests},
            {"label": "Server errors", "value": _pct(errors, requests), "hint": f"{errors} requests answered 5xx"},
            {"label": "Median response", "value": format_ms(percentile(overall, 0.5))},
            {"label": "95th percentile", "value": format_ms(percentile(overall, 0.95))},
            {"label": "MCP tool calls", "value": mcp_calls},
            {"label": "Failed logins", "value": failed_logins},
            {"label": "Lockouts", "value": lockouts},
            {"label": "Rate-limited requests", "value": rate_limited},
            {"label": "Database size", "value": database_size()},
        ]},
        {"kind": "table", "title": "API endpoints (busiest 25)", "empty": "No requests counted yet.",
         "columns": [{"label": "Endpoint"}, {"label": "Requests", "align": "end"}, {"label": "Errors", "align": "end"},
                     {"label": "Median", "align": "end"}, {"label": "95th pct", "align": "end"}],
         "rows": endpoint_rows},
        {"kind": "table", "title": "MCP tools", "empty": "No MCP tool calls yet.",
         "columns": [{"label": "Tool"}, {"label": "Calls", "align": "end"}, {"label": "Errors", "align": "end"}],
         "rows": [[t["key"], {"text": t["n"], "bar": t["n"] / top if top else 0}, t["failed"]] for t in tools[:25]]},
        {"kind": "table", "title": "Deliveries per day", "empty": "Nothing sent in this range.",
         "columns": [{"label": "Day"}, {"label": "Emails sent", "align": "end"}, {"label": "Emails failed", "align": "end"},
                     {"label": "Notifications sent", "align": "end"}, {"label": "Notifications failed", "align": "end"},
                     {"label": "Success", "align": "end"}],
         "rows": deliveries[::-1]},
        {"kind": "table", "title": "Scheduled jobs", "empty": "No job runs counted yet.",
         "columns": [{"label": "Job"}, {"label": "Runs", "align": "end"}, {"label": "Failed", "align": "end"},
                     {"label": "Average", "align": "end"}, {"label": "95th pct", "align": "end"}],
         "rows": jobs},
    ]


def _daily(kind: str, *, errors: bool = False):
    def compute(day):
        n, failed = counted_on(kind, day)
        return failed if errors else n

    return compute


def _emails(status):
    def compute(day):
        lo = datetime.combine(day, datetime.min.time(), tzinfo=dt_timezone.utc)
        return OutgoingEmail.objects.filter(created_at__gte=lo, created_at__lt=_end_of(day), status=status).count()

    return compute


def _stickiness(day):
    mau = active_users(day, 30)
    return 100 * active_users(day, 1) / mau if mau else 0


def register_builtins() -> None:
    from core_api.system import register_insight_section, register_insight_series, register_retention_rule

    for key, label, days in (("active_1d", "Active users (day)", 1), ("active_7d", "Active users (7 days)", 7),
                             ("active_30d", "Active users (30 days)", 30)):
        register_insight_series(InsightSeries(
            key, label, "Activity", lambda d, n=days: active_users(d, n),
            help="Signed in, refreshed a session, used an AI assistant or checked in.",
        ))
    register_insight_series(InsightSeries("stickiness", "Stickiness", "Activity", _stickiness, unit="%",
                                          help="Active today / active in the last 30 days."))
    register_insight_series(InsightSeries("api_requests", "API requests", "Platform", _daily("http"), kind="daily"))
    register_insight_series(InsightSeries("api_errors", "Server errors", "Platform", _daily("http", errors=True), kind="daily"))
    register_insight_series(InsightSeries("emails_sent", "Emails sent", "Platform", _emails(EmailStatus.SENT), kind="daily"))
    register_insight_series(InsightSeries("emails_failed", "Emails failed", "Platform", _emails(EmailStatus.FAILED), kind="daily"))

    register_insight_section(InsightSection(
        "active_users", "Active users", _active_users_section, order=10,
        description="Active = signed in, refreshed a session, used an AI assistant or checked in.",
    ))
    register_insight_section(InsightSection(
        "quality", "How well it runs", _quality_section, order=90,
        description="Requests, response times and errors per endpoint, MCP tools, deliveries, jobs and sign-in security.",
    ))

    register_retention_rule(RetentionRule(
        "audit", "the audit log", lambda cutoff: AuditEvent.objects.filter(created_at__lt=cutoff).delete()[0],
    ))
    register_retention_rule(RetentionRule(
        "emails", "the email log",
        lambda cutoff: OutgoingEmail.objects.filter(created_at__lt=cutoff).exclude(status=EmailStatus.QUEUED).delete()[0],
        help="Queued emails are never deleted.",
    ))
    register_retention_rule(RetentionRule(
        "notifications", "the notification log", lambda cutoff: DeliveryAttempt.objects.filter(created_at__lt=cutoff).delete()[0],
    ))

    def purge_insights(cutoff):
        day = cutoff.date()
        return (DailyStat.objects.filter(date__lt=day).delete()[0] + EventCount.objects.filter(date__lt=day).delete()[0]
                + UserDay.objects.filter(date__lt=day).delete()[0])

    register_retention_rule(RetentionRule(
        "insights", "Insights history", purge_insights,
        help="Daily numbers, request counts and active days behind the Insights page.",
    ))
