"""Instance-wide services every module can use - system settings, the
audit log, outgoing email, user removal and sessions - without depending
on the app that stores them (`platform_system`, from this same package).

When `platform_system` is installed (a host like apps/main), settings
are editable from its admin page, audit events are stored, and email
goes through its outbox (retried, logged). When it isn't (a module's
standalone deployment, its tests), everything here still works:
settings read their environment variable or default, `audit` does
nothing, `send_email` sends directly with Django's mail backend.

Settings: a module declares each one it reads with `register_setting`
(usually in its AppConfig.ready) and reads it with `get_setting`:

    register_setting(SettingDef("auth.signup_policy", "Who can sign up", "choice",
                                default="open", choices=[...], env="AUTH_SIGNUP_POLICY"))
    get_setting("auth.signup_policy")

A value comes from, in order: its `env` variable when set (shown in the
admin as "locked by environment"), the value saved in the admin
(`editable` ones only), the host's `SYSTEM_SETTING_DEFAULTS[key]`, the
definition's `default`. Read-only facts about the deployment (database,
secrets, versions) aren't settings - see `platform_system.info`.
"""

from __future__ import annotations

import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable

from django.apps import apps
from django.conf import settings
from django.dispatch import Signal

logger = logging.getLogger(__name__)

SYSTEM_APP = "platform_system"

#: Setting types: how a value is parsed from its env variable and shown in a form.
BOOL, STRING, TEXT, CHOICE, LIST, INT = "bool", "string", "text", "choice", "list", "int"


@dataclass(frozen=True)
class SettingDef:
    key: str
    label: str
    type: str = STRING
    default: Any = None
    help: str = ""
    group: str = "General"
    #: `[(value, label), ...]` for a CHOICE.
    choices: list | None = None
    #: The environment variable that, when set, overrides (and locks) it.
    env: str | None = None
    editable: bool = True
    #: Raises `ValueError(message)` for a value that can't be saved.
    validate: Callable[[Any], None] | None = field(default=None, compare=False)


_settings: dict[str, SettingDef] = {}


def register_setting(definition: SettingDef) -> None:
    _settings[definition.key] = definition


def setting_definitions() -> list[SettingDef]:
    return list(_settings.values())


def setting_definition(key: str) -> SettingDef:
    try:
        return _settings[key]
    except KeyError:
        raise KeyError(f"Unknown system setting {key!r} - register it with register_setting()") from None


def parse_setting(definition: SettingDef, raw: Any) -> Any:
    """`raw` (an env string, or a JSON value from a form) as the setting's type."""
    if definition.type == BOOL:
        return raw if isinstance(raw, bool) else str(raw).strip().lower() in ("1", "true", "yes", "on")
    if definition.type == INT:
        return int(raw)
    if definition.type == LIST:
        if isinstance(raw, (list, tuple)):
            items = raw
        else:
            text = str(raw).strip()
            items = json.loads(text) if text.startswith("[") else text.replace("\n", ",").split(",")
        return [str(item).strip() for item in items if str(item).strip()]
    if definition.type == CHOICE:
        value = str(raw)
        if definition.choices and value not in {c[0] for c in definition.choices}:
            raise ValueError(f"One of: {', '.join(c[0] for c in definition.choices)}.")
        return value
    return "" if raw is None else str(raw)


def env_value(definition: SettingDef) -> tuple[bool, Any]:
    """(locked, value) - locked when its env variable is set."""
    if definition.env and os.environ.get(definition.env) not in (None, ""):
        try:
            return True, parse_setting(definition, os.environ[definition.env])
        except (ValueError, TypeError):
            logger.warning("Ignoring invalid %s=%r", definition.env, os.environ[definition.env])
    return False, None


def default_value(definition: SettingDef) -> Any:
    return getattr(settings, "SYSTEM_SETTING_DEFAULTS", {}).get(definition.key, definition.default)


def get_setting(key: str) -> Any:
    definition = setting_definition(key)
    locked, value = env_value(definition)
    if locked:
        return value
    if definition.editable and apps.is_installed(SYSTEM_APP):
        from platform_system.store import stored_value

        found, value = stored_value(key)
        if found:
            return value
    return default_value(definition)


# --- audit log ---------------------------------------------------------


def audit(action: str, *, request=None, actor=None, target=None, target_type: str = "", target_id=None,
          target_label: str = "", **data) -> None:
    """Records a security-relevant event (`platform_system.AuditEvent`):
    `action` like "auth.login" or "user.disabled"; `actor` (anything with
    `.id`, optionally `.email`) defaults to `request.user`; `target` a
    model row (its type, id and `str()` are recorded). Never raises - an
    audit failure must not break the action it describes."""
    if not apps.is_installed(SYSTEM_APP):
        return
    try:
        from platform_system.audit import record

        record(action, request=request, actor=actor, target=target, target_type=target_type,
               target_id=target_id, target_label=target_label, data=data)
    except Exception:
        logger.exception("Couldn't record audit event %s", action)


# --- email ---------------------------------------------------------------


def email_configured() -> bool:
    """Whether outgoing email goes anywhere real (the host set EMAIL_URL)."""
    return bool(getattr(settings, "EMAIL_CONFIGURED", False))


#: Mail that is always sent (verification, password reset, security):
#: no preference, no unsubscribe link. Suppressed addresses still get none.
ACCOUNT_MAIL = "account"


@dataclass(frozen=True)
class EmailCategory:
    """A kind of email a user can turn off (Email preferences, the
    unsubscribe page): `send_email(..., category=key)` checks the user's
    choice (missing = `default`) and adds the one-click unsubscribe headers
    and footer. Account mail has no category."""

    key: str
    label: str
    help: str = ""
    default: bool = True
    order: int = 100


_email_categories: dict[str, EmailCategory] = {}


def register_email_category(category: EmailCategory) -> None:
    _email_categories[category.key] = category


def email_categories() -> list[EmailCategory]:
    return sorted(_email_categories.values(), key=lambda c: (c.order, c.label))


def email_category(key: str) -> EmailCategory | None:
    return _email_categories.get(key)


def public_url(path: str = "") -> str:
    """An absolute link to this instance (`settings.PUBLIC_URL`), for mail
    sent outside a request; "" when it isn't set."""
    base = (getattr(settings, "PUBLIC_URL", "") or "").rstrip("/")
    return f"{base}{path}" if base else ""


def send_email(to: str | list[str], subject: str, text: str, *, html: str | None = None, kind: str = "",
               user_id=None, category: str = ACCOUNT_MAIL, headers: dict | None = None) -> bool:
    """Sends an email - through `platform_system`'s outbox when installed
    (stored, sent right after the current transaction commits, retried by
    `run_system_jobs`), else directly. Never raises for a delivery
    failure; an unconfigured instance just logs it.

    With `platform_system`, nothing goes to a suppressed address (a hard
    bounce or complaint), and a `category` other than account mail is only
    sent to `user_id` if they haven't turned it off - it then carries
    `List-Unsubscribe` headers and an unsubscribe footer. Returns whether
    it was queued (False: suppressed or opted out)."""
    recipients = [to] if isinstance(to, str) else list(to)
    if apps.is_installed(SYSTEM_APP):
        from platform_system.mail import queue

        return queue(recipients, subject, text, html=html, kind=kind, user_id=user_id, category=category,
                     headers=headers) is not None
    from django.core.mail import EmailMultiAlternatives

    message = EmailMultiAlternatives(subject, text, to=recipients, headers=headers)
    if html:
        message.attach_alternative(html, "text/html")
    try:
        message.send()
    except Exception:
        logger.exception("Sending %s email failed", kind or "an")
    return True


def run_system_jobs() -> dict:
    """Periodic work (retrying queued email, ...) - called by the host's
    scheduler. Nothing to do without `platform_system`."""
    if not apps.is_installed(SYSTEM_APP):
        return {}
    from platform_system.jobs import run

    return run()


# --- users -------------------------------------------------------------

#: Sent BEFORE a user account is deleted, so every module can deal with
#: what it holds for them by bare id: `user_id`, and `transfer_to` - the
#: user who takes over what they own, or None to erase it. A receiver may
#: raise `django.core.exceptions.ValidationError` to stop the deletion.
user_removed = Signal()


@dataclass(frozen=True)
class SessionProvider:
    """Something a user is signed in with besides a login session - e.g.
    platform-mcp's personal access tokens and OAuth connections. `list`
    returns `[{"id", "label", "created_at", "last_used_at", "expires_at"}]`;
    `revoke_all` revokes every one and returns how many."""

    kind: str
    label: str
    list: Callable[[str], list[dict]]
    revoke_all: Callable[[str], int]


_session_providers: dict[str, SessionProvider] = {}


def register_session_provider(provider: SessionProvider) -> None:
    _session_providers[provider.kind] = provider


def session_providers() -> list[SessionProvider]:
    return list(_session_providers.values())


#: Sent BEFORE an organization is deleted (by its owner or an admin), so
#: modules drop what they keep under its bare id (goals, cycles, ...).
org_removed = Signal()


# --- operations: scheduler heartbeats, delivery log, usage ----------------


def heartbeat(name: str, *, ok: bool = True, error: str = "", result: dict | None = None) -> None:
    """A periodic job reports a run (`platform_system.JobHeartbeat`) - the
    admin's Status page flags one that stopped running or keeps failing."""
    if not apps.is_installed(SYSTEM_APP):
        return
    try:
        from platform_system.ops import record_heartbeat

        record_heartbeat(name, ok=ok, error=error, result=result or {})
    except Exception:
        logger.exception("Couldn't record heartbeat for %s", name)


def log_delivery(channel: str, kind: str, *, user_id=None, target: str = "", ok: bool, error: str = "") -> None:
    """A notification sent outside the email outbox (e.g. an Apprise
    reminder) - kept for the admin's Notification log. `target` must not
    hold secrets: pass a scheme or host, never a full URL."""
    if not apps.is_installed(SYSTEM_APP):
        return
    try:
        from platform_system.models import DeliveryAttempt

        DeliveryAttempt.objects.create(
            channel=channel, kind=kind, user_id=str(user_id or ""), target=target[:255], ok=ok, error=error[:2000]
        )
    except Exception:
        logger.exception("Couldn't log a %s delivery", channel)


@dataclass(frozen=True)
class UsageProvider:
    """A module's numbers for the admin's Status page: `rows()` returns
    `[{"label", "value", "hint"?}]` under `group`."""

    group: str
    rows: Callable[[], list[dict]]


_usage_providers: list[UsageProvider] = []


def register_usage_provider(provider: UsageProvider) -> None:
    _usage_providers.append(provider)


def usage_providers() -> list[UsageProvider]:
    return list(_usage_providers)


# --- per-organization limits ---------------------------------------------
#
# A limit is a system setting `limits.<key>` (0 = unlimited), which an
# organization may override - e.g. per hosted plan. Whoever stores the
# overrides (platform-org's `Organization.limits`) registers a source.

_org_limit_sources: list[Callable[[str], dict]] = []


def register_org_limits_source(source: Callable[[str], dict]) -> None:
    _org_limit_sources.append(source)


def org_limit(org_id, key: str) -> int:
    """The limit `key` for an org: its override, else `limits.<key>`; 0 = none."""
    for source in _org_limit_sources:
        value = (source(str(org_id)) or {}).get(key)
        if value is not None:
            return int(value)
    try:
        return int(get_setting(f"limits.{key}") or 0)
    except KeyError:
        return 0


def check_org_limit(org_id, key: str, current: int, what: str) -> None:
    """Raises a 403 `limit_reached` when one more `what` would pass the limit."""
    limit = org_limit(org_id, key)
    if limit and current >= limit:
        from core_api.errors import ApiError

        raise ApiError(403, "limit_reached", f"This organization has reached its limit of {limit} {what}.")


# --- personal data export (GDPR) -------------------------------------------

_export_providers: dict[str, Callable[[str], Any]] = {}


def register_export_provider(name: str, provider: Callable[[str], Any]) -> None:
    """A module's part of a user's data export: `provider(user_id)` returns
    JSON-able data (no secrets - token hashes, passwords)."""
    _export_providers[name] = provider


def export_user_data(user_id) -> dict:
    data = {}
    for name, provider in _export_providers.items():
        try:
            data[name] = provider(str(user_id))
        except Exception:
            logger.exception("Export provider %s failed", name)
            data[name] = {"error": "couldn't export this part"}
    return data


# --- data retention ------------------------------------------------------
#
# A module that keeps rows which pile up (logs, history) registers a rule:
# a system setting `retention.<name>_days` (0 = keep forever) and a purge
# function deleting rows older than a cutoff. `run_system_jobs` applies
# every rule once a day.


@dataclass(frozen=True)
class RetentionRule:
    name: str
    label: str
    #: Deletes rows created before `cutoff` (an aware datetime); returns how many.
    purge: Callable[[Any], int]
    help: str = ""
    #: The host can set a different default (`SYSTEM_SETTING_DEFAULTS`).
    default_days: int = 0


_retention_rules: dict[str, RetentionRule] = {}


def _non_negative(value) -> None:
    if int(value) < 0:
        raise ValueError("0 (keep forever) or more days.")


def register_retention_rule(rule: RetentionRule) -> None:
    """Also declares its setting, `retention.<name>_days`, under "Data retention"."""
    _retention_rules[rule.name] = rule
    register_setting(SettingDef(
        f"retention.{rule.name}_days", f"Keep {rule.label} for (days)", INT, default=rule.default_days,
        group="Data retention", validate=_non_negative,
        help=(rule.help + " " if rule.help else "") + "0 = keep forever. Older rows are deleted once a day.",
    ))


def retention_rules() -> list[RetentionRule]:
    return list(_retention_rules.values())


# --- insights: who is active, counters, daily numbers ----------------------
#
# The admin's Insights page (`/system/insights`). Aggregates only, nothing
# leaves the instance. Without `platform_system` every call here is a no-op.

#: A user's channel: the website, or an AI assistant (MCP).
WEB, AGENT = "web", "agent"


def seen(user_id, channel: str = WEB) -> None:
    """The user did something just now through `channel` - signed in,
    refreshed a session, called an MCP tool, checked in. Kept as their
    `last_seen_at` and one row per active day, written at most hourly per
    process, so calling it on every request is cheap. Never raises."""
    if not user_id or not apps.is_installed(SYSTEM_APP):
        return
    try:
        from platform_system.insights import record_seen

        record_seen(str(user_id), channel)
    except Exception:
        logger.exception("Couldn't record activity for %s", user_id)


def count(kind: str, key: str, *, ok: bool = True, ms: float | None = None) -> None:
    """Counts one event per day - an API request ("http", "GET
    /api/v1/goals"), an MCP tool call ("mcp.tool", name), a rate-limit hit,
    a job run - with whether it failed and how long it took. Buffered in
    the process and written every few seconds. Never raises."""
    if not apps.is_installed(SYSTEM_APP):
        return
    try:
        from platform_system.insights import record_count

        record_count(kind, key, ok=ok, ms=ms)
    except Exception:
        logger.exception("Couldn't count %s %s", kind, key)


def active_user_count(days: int) -> int | None:
    """Users active in the last `days` days (see `seen`); None without `platform_system`."""
    if not apps.is_installed(SYSTEM_APP):
        return None
    from platform_system.insights import active_users, today

    return active_users(today(), days)


def last_seen(user_ids) -> dict[str, Any]:
    """`{user_id: last_seen_at}` for those of `user_ids` ever seen."""
    if not apps.is_installed(SYSTEM_APP):
        return {}
    from platform_system.models import UserPresence

    rows = UserPresence.objects.filter(user_id__in=[str(u) for u in user_ids])
    return dict(rows.values_list("user_id", "last_seen_at"))


def users_last_seen_between(start, end) -> list[tuple[str, Any]]:
    """`[(user_id, last_seen_at)]` of users last active in `[start, end)` -
    e.g. the ones who went quiet a week ago."""
    if not apps.is_installed(SYSTEM_APP):
        return []
    from platform_system.models import UserPresence

    rows = UserPresence.objects.filter(last_seen_at__gte=start, last_seen_at__lt=end)
    return list(rows.values_list("user_id", "last_seen_at"))


def counted(kind: str, day) -> tuple[int, int]:
    """(events, failures) of `kind` counted on `day` (a date)."""
    if not apps.is_installed(SYSTEM_APP):
        return 0, 0
    from platform_system.insights import counted_on

    return counted_on(kind, day)


@dataclass(frozen=True)
class InsightSeries:
    """A number tracked per day on the Insights page: `compute(day)` is its
    value at the end of `day` (a date) - a total so far ("Users") or what
    happened that day ("Check-ins"). Written once a day by the scheduler
    (today's refreshed hourly) and backfilled for past days the first
    time, so it must work for any past day."""

    key: str
    label: str
    group: str
    compute: Callable[[Any], float]
    help: str = ""
    #: "total" (a level - change is its difference) or "daily" (events per
    #: day - a range sums them).
    kind: str = "total"
    #: Shown after the value, e.g. "%".
    unit: str = ""


@dataclass(frozen=True)
class InsightSection:
    """A part of the Insights page computed live for the chosen range:
    `build(days)` returns blocks - `{"kind": "tiles", "items": [{"label",
    "value", "hint"?}]}` or `{"kind": "table", "title"?, "columns":
    [{"label", "align"?: "end"}], "rows": [[cell, ...]], "empty"?}` where a
    cell is text/number or `{"text", "bar"?: 0-1, "heat"?: 0-1, "hint"?}`."""

    key: str
    title: str
    build: Callable[[int], list[dict]]
    description: str = ""
    order: int = 100


_insight_series: dict[str, InsightSeries] = {}
_insight_sections: dict[str, InsightSection] = {}


def register_insight_series(series: InsightSeries) -> None:
    _insight_series[series.key] = series


def insight_series() -> list[InsightSeries]:
    return list(_insight_series.values())


def register_insight_section(section: InsightSection) -> None:
    _insight_sections[section.key] = section


def insight_sections() -> list[InsightSection]:
    return sorted(_insight_sections.values(), key=lambda s: (s.order, s.title))
