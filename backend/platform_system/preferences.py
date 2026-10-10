"""Email preferences and unsubscribing (`core_api.system.EmailCategory`).

A category's mail is only sent to a user who hasn't turned it off, and
carries a signed unsubscribe link - no login, no table: the token holds
the user, the category and an optional reference (a lifecycle send),
signed with the secret key. It's used two ways:

- `List-Unsubscribe: <.../api/v1/email/unsubscribe/<token>>` with
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) - the
  mail client's own "Unsubscribe" button POSTs there;
- the footer link, the page `PLATFORM_EMAIL_UNSUBSCRIBE_PAGE` on the
  frontend (every category, one switch each), which uses the same API.
"""

from __future__ import annotations

from django.conf import settings
from django.core import signing
from django.dispatch import Signal

from core_api.system import ACCOUNT_MAIL, email_categories, email_category, get_setting, public_url

from platform_system.models import EmailPreference

SALT = "platform_system.unsubscribe"
DEFAULT_PAGE = "/email/unsubscribe/{token}"

#: Sent when a user turns a category off from an email's link:
#: `user_id`, `category`, `ref` (what the token carried, e.g. a lifecycle send's id).
unsubscribed = Signal()


def is_enabled(user_id, category: str) -> bool:
    if category == ACCOUNT_MAIL:
        return True
    row = EmailPreference.objects.filter(user_id=str(user_id), category=category).first()
    if row is not None:
        return row.enabled
    definition = email_category(category)
    return definition.default if definition else True


def preferences(user_id) -> list[dict]:
    saved = dict(EmailPreference.objects.filter(user_id=str(user_id)).values_list("category", "enabled"))
    return [
        {"key": c.key, "label": c.label, "help": c.help, "enabled": saved.get(c.key, c.default)}
        for c in email_categories()
    ]


def save(user_id, choices: dict) -> list[dict]:
    """Saves `{category: bool}`; unknown categories are ignored."""
    known = {c.key for c in email_categories()}
    for key, enabled in choices.items():
        if key in known:
            EmailPreference.objects.update_or_create(
                user_id=str(user_id), category=key, defaults={"enabled": bool(enabled)}
            )
    return preferences(user_id)


def make_token(user_id, category: str, ref: str = "") -> str:
    return signing.dumps({"u": str(user_id), "c": category, "r": ref}, salt=SALT, compress=True)


def read_token(token: str) -> dict | None:
    try:
        data = signing.loads(token, salt=SALT)
    except signing.BadSignature:
        return None
    return data if isinstance(data, dict) and data.get("u") and data.get("c") else None


def unsubscribe_links(user_id, category: str, ref: str = "") -> tuple[str, str] | None:
    """(one-click API URL, preferences page URL), or None without `PUBLIC_URL`."""
    if not public_url():
        return None
    token = make_token(user_id, category, ref)
    page = getattr(settings, "PLATFORM_EMAIL_UNSUBSCRIBE_PAGE", DEFAULT_PAGE)
    return public_url(f"/api/v1/email/unsubscribe/{token}"), public_url(page.format(token=token))


def add_footer(text: str, html: str | None, category: str, page: str | None) -> tuple[str, str | None]:
    """The footer every categorized email ends with: why it came, how to
    stop it, and the sender's postal address (`email.postal_address`)."""
    definition = email_category(category)
    label = definition.label if definition else category
    address = (get_setting("email.postal_address") or "").strip()
    lines = [f"You get this because \"{label}\" emails are on for your account."]
    if page:
        lines.append(f"Unsubscribe or choose what you get: {page}")
    if address:
        lines.append(address)
    text = f"{text.rstrip()}\n\n--\n" + "\n".join(lines)
    if html is not None:
        from django.utils.html import escape

        parts = [escape(lines[0])]
        if page:
            parts.append(f'<a href="{escape(page)}" style="color:#667382">Unsubscribe or choose what you get</a>')
        if address:
            parts.append(escape(address).replace("\n", "<br>"))
        footer = (
            '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e6e7e9;'
            'font-size:12px;line-height:1.6;color:#667382">' + "<br>".join(parts) + "</div>"
        )
        html = html.replace("</body>", footer + "</body>") if "</body>" in html else html + footer
    return text, html
