"""Lifecycle email - the mail an instance sends on its own initiative
(onboarding, habit, win-back, ...) - without depending on the app that
runs it (`platform_lifecycle`, from this same package). Design:
docs/lifecycle-email.md in the GoalNexa repo.

A module describes what it sends as journeys, in code:

    register_journey(Journey(
        "onboarding", "Onboarding", category="tips", trigger="signup",
        steps=[Step("welcome", timedelta(0), render_welcome, target="goal_created"), ...],
        exit=lambda user_id, enrollment: "activated" if has_check_in(user_id) else None,
    ))

and reports what users do with `record_signal(user_id, "goal_created")`.
A signal named in a journey's `trigger` enrolls the user (once per
`key`); a journey's `enter` scan enrolls users found by a query (e.g.
idle ones). The scheduler (`run_lifecycle_jobs`, from the host's job
loop) sends each enrollment's steps when due, through the guards: the
user's category preference, suppressed addresses, the frequency cap,
quiet hours in their timezone, the sunset (no mail after long
inactivity) and the holdout (a random share who get nothing, to measure
against). A step's `render` returns its `Message`, or None to skip it -
so its condition is checked when it's due, against the current state.

A step's `target` names the signal that counts as its success; one
within `CONVERSION_WINDOW` of the send stamps it converted (`SEEN` = the
user came back at all). The same is recorded for the holdout.

Without `platform_lifecycle` installed, or with the `lifecycle.enabled`
setting off, nothing is recorded or sent.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable, Iterable

from django.apps import apps

logger = logging.getLogger(__name__)

LIFECYCLE_APP = "platform_lifecycle"

#: A signal-less target: the user was active again (`core_api.system.seen`).
SEEN = "seen"
#: How long after a send its target action still counts.
CONVERSION_WINDOW = timedelta(hours=72)


@dataclass(frozen=True)
class Message:
    """One lifecycle email: a subject, a few short paragraphs of plain text
    (the greeting and footer are added), and at most one button -
    `(label, path)`, a path on this instance or an absolute URL."""

    subject: str
    paragraphs: list[str]
    button: tuple[str, str] | None = None
    #: A line after the button, e.g. "Or tell your assistant: ...".
    after: list[str] = field(default_factory=list)


@dataclass
class StepContext:
    """What a step renders from: the user, their enrollment's `data` (from
    the signal or scan that enrolled them), and `now`."""

    user_id: str
    name: str
    email: str
    data: dict
    entered_at: datetime
    now: datetime

    @property
    def first_name(self) -> str:
        return (self.name or "").strip().split(" ")[0]


@dataclass(frozen=True)
class Step:
    key: str
    #: After the enrollment started (not after the previous step).
    delay: timedelta
    render: Callable[[StepContext], Message | None]
    #: The signal that counts as this step working (or SEEN); "" = none.
    target: str = ""
    label: str = ""


@dataclass(frozen=True)
class Enrolled:
    """An enrollment as `Journey.exit` sees it."""

    user_id: str
    key: str
    data: dict
    entered_at: datetime


@dataclass(frozen=True)
class Journey:
    key: str
    label: str
    #: An email category (`core_api.system.register_email_category`).
    category: str
    steps: list[Step]
    description: str = ""
    #: A signal name that enrolls its user; the enrollment's key is the
    #: signal's `key` data (so one per key), else "" (once per user).
    trigger: str = ""
    #: A scan run every pass: `enter(now)` yields `(user_id, key, data)`
    #: for users to enroll - an existing (user, key) is never enrolled twice.
    enter: Callable[[datetime], Iterable[tuple[str, str, dict]]] | None = None
    #: `exit(enrollment, now)` -> a reason to stop the journey, or None.
    exit: Callable[[Enrolled, datetime], str | None] | None = None
    #: Sent to long-inactive users too (the win-back journey itself).
    ignore_sunset: bool = False
    #: Measure it against a holdout (a share of users who get nothing).
    holdout: bool = True


_journeys: dict[str, Journey] = {}
_handlers: dict[str, list[Callable[[str, dict], None]]] = {}


def register_journey(journey: Journey) -> None:
    _journeys[journey.key] = journey


def journeys() -> list[Journey]:
    return list(_journeys.values())


def get_journey(key: str) -> Journey | None:
    return _journeys.get(key)


def on_signal(name: str, handler: Callable[[str, dict], None]) -> None:
    """Runs `handler(user_id, data)` whenever `name` is recorded (while
    lifecycle email is on) - e.g. a default to set up at signup."""
    _handlers.setdefault(name, []).append(handler)


def enabled() -> bool:
    if not apps.is_installed(LIFECYCLE_APP):
        return False
    from core_api.system import get_setting

    try:
        return bool(get_setting("lifecycle.enabled"))
    except KeyError:
        return False


def record_signal(user_id, name: str, **data: Any) -> None:
    """The user did `name` (e.g. "check_in"). Kept for conversions,
    enrolls the user in journeys it triggers, runs `on_signal` handlers.
    `data` must be JSON-able; a `key` in it names the enrollment. Never
    raises - a lifecycle failure must not break the write it reports."""
    if not user_id or not enabled():
        return
    try:
        from platform_lifecycle.engine import record

        record(str(user_id), name, data)
    except Exception:
        logger.exception("Couldn't record lifecycle signal %s for %s", name, user_id)
        return
    for handler in _handlers.get(name, []):
        try:
            handler(str(user_id), data)
        except Exception:
            logger.exception("Lifecycle handler for %s failed", name)


def run_lifecycle_jobs() -> dict:
    """Enrolls, exits and sends what's due - called by the host's scheduler."""
    if not enabled():
        return {}
    from platform_lifecycle.engine import run

    return run()
