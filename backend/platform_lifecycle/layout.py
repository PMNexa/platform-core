"""One layout for every lifecycle email: greeting, the step's paragraphs,
its button, then the lines after it - as plain text and as simple HTML
(inline styles, no images, no tracking pixel). The footer (why it came,
unsubscribe, postal address) is added by the outbox for every
categorized email (`platform_system.preferences.add_footer`).

The button goes through `/api/v1/l/<token>` - a signed (send, URL) pair -
so a click is stamped on the send before the redirect. Only URLs this
instance signed redirect, so it can't be used as an open redirect."""

from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from django.core import signing
from django.utils.html import escape, urlize

from core_api.lifecycle import Message
from core_api.system import get_setting, public_url

CLICK_SALT = "platform_lifecycle.click"


def absolute(path_or_url: str) -> str:
    return path_or_url if "://" in path_or_url else public_url(path_or_url)


def with_utm(url: str, campaign: str) -> str:
    parts = urlsplit(url)
    if parts.netloc and parts.netloc != urlsplit(public_url()).netloc:
        return url  # someone else's site: no tracking parameters
    query = dict(parse_qsl(parts.query))
    query.update({"utm_source": "email", "utm_medium": "lifecycle", "utm_campaign": campaign})
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def tracked(url: str, send_id) -> str:
    if not send_id:
        return url
    token = signing.dumps([str(send_id), url], salt=CLICK_SALT, compress=True)
    return public_url(f"/api/v1/l/{token}")


def read_click(token: str) -> tuple[str, str] | None:
    try:
        send_id, url = signing.loads(token, salt=CLICK_SALT)
    except (signing.BadSignature, ValueError, TypeError):
        return None
    return str(send_id), str(url)


def render(message: Message, first_name: str, campaign: str, send_id=None) -> tuple[str, str]:
    """(text, html) of `message`."""
    greeting = f"Hi {first_name}," if first_name else "Hi,"
    button = None
    if message.button:
        label, target = message.button
        button = (label, tracked(with_utm(absolute(target), campaign), send_id))
    sender = get_setting("email.from_name") or ""

    text = [greeting, *message.paragraphs]
    if button:
        text.append(f"{button[0]}: {button[1]}")
    text.extend(message.after)
    if sender:
        text.append(f"- {sender}")
    text_body = "\n\n".join(text) + "\n"

    p = '<p style="margin:0 0 16px">{}</p>'
    html = [p.format(escape(greeting))]
    html += [p.format(urlize(escape(par)).replace("\n", "<br>")) for par in message.paragraphs]
    if button:
        html.append(
            '<p style="margin:24px 0"><a href="{}" style="display:inline-block;padding:10px 18px;'
            'background:#066fd1;color:#ffffff;text-decoration:none;border-radius:4px;font-weight:600">{}</a></p>'
            .format(escape(button[1]), escape(button[0]))
        )
    html += [p.format(urlize(escape(line)).replace("\n", "<br>")) for line in message.after]
    if sender:
        html.append(p.format(f"- {escape(sender)}"))
    html_body = (
        '<!doctype html><html><body style="margin:0;padding:24px;background:#ffffff">'
        '<div style="max-width:560px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\','
        'Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1d273b">'
        + "".join(html)
        + "</div></body></html>"
    )
    return text_body, html_body
