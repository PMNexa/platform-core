"""Amazon SES bounces and complaints, from SNS (`POST /api/v1/email/ses-events`).

Setup (docs/deployment.md, "Email"): an SES configuration set with an SNS
event destination for Bounce and Complaint, its name in
`email.ses_configuration_set` (every message then carries
`X-SES-CONFIGURATION-SET`), the topic's ARN in `email.ses_topic_arns`, and
an HTTPS subscription of the topic to this endpoint - confirmed here
automatically.

Every message is checked before anything is done with it: its topic must
be one of `email.ses_topic_arns` (none set = everything refused - anyone
can create a topic, sign with it and post here), and its SNS signature
must verify against Amazon's certificate. A permanent bounce or a
complaint puts the address on the suppression list; transient bounces
(mailbox full, ...) are ignored - the outbox's retries cover them.
"""

from __future__ import annotations

import base64
import json
import logging
import re
import urllib.request
from functools import lru_cache
from urllib.parse import urlsplit

from core_api.system import audit, get_setting

from platform_system.models import Suppression, SuppressionReason

logger = logging.getLogger(__name__)

_SNS_HOST = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$")
_SIGNED_FIELDS = {
    "Notification": ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"],
    "SubscriptionConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
    "UnsubscribeConfirmation": ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"],
}


class Rejected(Exception):
    pass


def _amazon_url(url: str) -> bool:
    parts = urlsplit(url or "")
    return parts.scheme == "https" and bool(_SNS_HOST.match(parts.hostname or ""))


@lru_cache(maxsize=8)
def _certificate(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=10) as response:  # noqa: S310 - https on an SNS host, checked by the caller
        return response.read()


def verify(body: dict) -> None:
    """Raises `Rejected` unless `body` is a genuine SNS message from an allowed topic."""
    kind = body.get("Type")
    if kind not in _SIGNED_FIELDS:
        raise Rejected(f"Unknown message type {kind!r}.")
    allowed = set(get_setting("email.ses_topic_arns") or [])
    if body.get("TopicArn") not in allowed:
        raise Rejected("Topic not allowed - add its ARN to the email.ses_topic_arns setting.")
    cert_url = body.get("SigningCertURL") or body.get("SigningCertUrl") or ""
    if not _amazon_url(cert_url):
        raise Rejected("Signing certificate isn't from Amazon SNS.")
    to_sign = "".join(
        f"{name}\n{body[name]}\n" for name in _SIGNED_FIELDS[kind] if name in body and body[name] is not None
    ).encode()
    from cryptography import x509
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    digest = hashes.SHA256() if str(body.get("SignatureVersion")) == "2" else hashes.SHA1()  # noqa: S303 - SNS v1
    try:
        key = x509.load_pem_x509_certificate(_certificate(cert_url)).public_key()
        key.verify(base64.b64decode(body.get("Signature") or ""), to_sign, padding.PKCS1v15(), digest)
    except (InvalidSignature, ValueError) as exc:
        raise Rejected("Bad signature.") from exc


def handle(body: dict) -> dict:
    """Acts on a verified SNS message; returns what was done."""
    kind = body["Type"]
    if kind == "SubscriptionConfirmation":
        if not _amazon_url(body.get("SubscribeURL", "")):
            raise Rejected("Subscribe URL isn't Amazon SNS.")
        with urllib.request.urlopen(body["SubscribeURL"], timeout=10):  # noqa: S310 - checked above
            pass
        audit("email.ses_subscribed", target_label=body.get("TopicArn", ""))
        return {"confirmed": True}
    if kind != "Notification":
        return {}
    try:
        event = json.loads(body.get("Message") or "{}")
    except ValueError:
        return {}
    return {"suppressed": record_event(event)}


def record_event(event: dict) -> int:
    """Suppresses the addresses of a permanent bounce or a complaint
    (SES event publishing's `eventType`, or a notification's
    `notificationType`); returns how many were added."""
    kind = event.get("eventType") or event.get("notificationType")
    if kind == "Bounce":
        bounce = event.get("bounce") or {}
        if bounce.get("bounceType") != "Permanent":
            return 0
        recipients = bounce.get("bouncedRecipients") or []
        reason = SuppressionReason.BOUNCE
    elif kind == "Complaint":
        recipients = (event.get("complaint") or {}).get("complainedRecipients") or []
        reason = SuppressionReason.COMPLAINT
    else:
        return 0
    added = 0
    for recipient in recipients:
        email = (recipient.get("emailAddress") or "").strip().lower()
        if not email:
            continue
        detail = (recipient.get("diagnosticCode") or (event.get(kind.lower()) or {}).get("complaintFeedbackType") or "")
        _, created = Suppression.objects.get_or_create(
            email=email, defaults={"reason": reason, "detail": str(detail)[:500]}
        )
        added += created
    return added
