"""The email outbox: `queue` stores a message and sends it once the
current transaction commits (so a rolled-back request sends nothing);
`deliver` sends one, `retry_due` the ones whose retry time has come
(`jobs.run`). Failures back off 1, 5, 30 minutes, then 2 and 6 hours,
and give up after `MAX_ATTEMPTS`. Every message is kept as the delivery
log (`/api/v1/outgoing-emails`)."""

import logging
from datetime import timedelta
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.utils import timezone

from core_api.system import email_configured, get_setting

from platform_system.models import EmailStatus, OutgoingEmail

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
BACKOFF = [timedelta(minutes=1), timedelta(minutes=5), timedelta(minutes=30), timedelta(hours=2), timedelta(hours=6)]


def sender() -> str:
    _, address = parseaddr(settings.DEFAULT_FROM_EMAIL)
    return formataddr((get_setting("email.from_name") or "", address or settings.DEFAULT_FROM_EMAIL))


def queue(to: list[str], subject: str, text: str, *, html=None, kind="", user_id=None) -> OutgoingEmail:
    message = OutgoingEmail.objects.create(
        to=to, subject=subject[:255], text=text, html=html or "", kind=kind, user_id=str(user_id or "")
    )
    transaction.on_commit(lambda: deliver(message.id))
    return message


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
    reply_to = get_setting("email.reply_to")
    mail = EmailMultiAlternatives(
        message.subject, message.text, from_email=sender(), to=message.to, reply_to=[reply_to] if reply_to else None
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
