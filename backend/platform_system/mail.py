"""The email outbox: `queue` stores a message and sends it once the
current transaction commits (so a rolled-back request sends nothing);
`deliver` sends one, `retry_due` the ones whose retry time has come
(`jobs.run`). Nothing goes to a suppressed address (`Suppression`), and
categorized mail respects the user's preferences (`preferences.py`). Failures back off 1, 5, 30 minutes, then 2 and 6 hours,
and give up after `MAX_ATTEMPTS`. Every message is kept as the delivery
log (`/api/v1/outgoing-emails`)."""

import logging
from datetime import timedelta
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from core_api.system import ACCOUNT_MAIL, email_configured, get_setting

from platform_system.models import EmailStatus, OutgoingEmail, Suppression

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
BACKOFF = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=2), timedelta(hours=6)]


def sender() -> str:
    _, address = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return formataddr((get_setting("email.from_name") or "", address or settings.DEFAULT_FROM_EMAIL))


def queue(to: list[str], subject: str, text: str, *, html=None, kind="", user_id=None, category=ACCOUNT_MAIL,
          headers=None, unsubscribe_ref: str = "") -> OutgoingEmail | None:
    """Stores a message to send after the current transaction commits.
    None when nothing was queued: a `category` the user turned off. A
    message whose every recipient is suppressed is logged, not sent."""
    from platform_system.preferences import add_footer, is_enabled, unsubscribe_links

    headers = dict(headers or {})
    if category != ACCOUNT_MAIL:
        if user_id and not is_enabled(user_id, category):
            return None
        links = unsubscribe_links(user_id, category, unsubscribe_ref) if user_id else None
        if links:
            headers["List-Unsubscribe"] = f"<{links[0]}>"
            headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click"
        text, html = add_footer(text, html, category, links[1] if links else None)
    blocked = suppressed(to)
    message = OutgoingEmail.objects.create(
        to=to, subject=subject[:255], text=text, html=html or "", kind=kind, user_id=str(user_id or ""),
        category="" if category == ACCOUNT_MAIL else category, headers=headers or None,
    )
    if blocked and len(blocked) == len(to):
        OutgoingEmail.objects.filter(id=message.id).update(
            status=EmailStatus.SUPPRESSED, last_error=f"Not sent: suppressed address ({', '.join(sorted(blocked))})."
        )
        message.status = EmailStatus.SUPPRESSED
        return message
    transaction.on_commit(lambda: deliver(message.id))
    return message


def suppressed(addresses) -> set[str]:
    """Which of `addresses` are on the suppression list (lowercased)."""
    wanted = {a.strip().lower() for a in addresses}
    return set(Suppression.objects.filter(email__in=wanted).values_list("email", flat=True))


def deliver(message_id) -> bool:
    """Sends one queued message, if it's still queued (claimed with a
    conditional update, so two workers never both send it)."""
    now = timezone.now()
    claimed = OutgoingEmail.objects.filter(id=message_id, status=EmailStatus.QUEUED, next_attempt_at__lte=now).update(
        next_attempt_at=now + timedelta(minutes=10)
    )
    if not claimed:
        return False
    message = OutgoingEmail.objects.get(id=message_id)
    if not email_configured():
        OutgoingEmail.objects.filter(id=message.id).update(
            status=EmailStatus.FAILED, last_error="Email isn't configured (EMAIL_URL is not set).", attempts=message.attempts + 1
        )
        return False
    blocked = suppressed(message.to)
    to = [address for address in message.to if address.strip().lower() not in blocked]
    if not to:
        OutgoingEmail.objects.filter(id=message.id).update(
            status=EmailStatus.SUPPRESSED, last_error="Not sent: suppressed address."
        )
        return False
    reply_to = get_setting("email.reply_to")
    headers = dict(message.headers or {})
    configuration_set = (get_setting("email.ses_configuration_set") or "").strip()
    if configuration_set:
        # Amazon SES reports this message's bounces/complaints to that set's SNS topic.
        headers["X-SES-CONFIGURATION-SET"] = configuration_set
    mail = EmailMultiAlternatives(
        message.subject, message.text, from_email=sender(), to=to, reply_to=[reply_to] if reply_to else None,
        headers=headers or None,
    )
    if message.html:
        mail.attach_alternative(message.html, "text/html")
    attempts = message.attempts + 1
    try:
        mail.send()
    except Exception as exc:
        logger.warning("Email %s (%s) failed: %s", message.id, message.kind, exc)
        failed = attempts >= MAX_ATTEMPTS
        OutgoingEmail.objects.filter(id=message.id).update(
            attempts=attempts,
            last_error=str(exc)[:2000],
            status=EmailStatus.FAILED if failed else EmailStatus.QUEUED,
            next_attempt_at=now + BACKOFF[min(attempts - 1, len(BACKOFF) - 1)],
        )
        return False
    OutgoingEmail.objects.filter(id=message.id).update(
        attempts=attempts, status=EmailStatus.SENT, sent_at=timezone.now(), last_error=""
    )
    return True


def retry_due(limit: int = 100) -> int:
    due = OutgoingEmail.objects.filter(status=EmailStatus.QUEUED, next_attempt_at__lte=timezone.now()).order_by(
        "next_attempt_at"
    ).values_list("id", flat=True)[:limit]
    return sum(deliver(message_id) for message_id in list(due))
