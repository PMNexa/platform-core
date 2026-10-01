"""`EMAIL_URL` -> Django email settings, for a host's settings.py:

    globals().update(email_settings(os.environ.get("EMAIL_URL"), os.environ.get("EMAIL_FROM")))

- `smtp://user:pass@host:587` - STARTTLS (the default on 587);
  `?tls=0` turns it off.
- `smtps://user:pass@host:465` - implicit TLS.
- `console://` - prints messages to the log (development).
- unset - email isn't configured: messages are stored but not sent
  (Django's dummy backend), `EMAIL_CONFIGURED` is False.

User and password are percent-decoded (`%40` for an `@` in a username).
Plain module, no Django imports - safe to call from settings.py.
"""

from urllib.parse import parse_qs, unquote, urlsplit


def email_settings(url: str | None, from_email: str | None = None) -> dict:
    result = {
        "EMAIL_CONFIGURED": False,
        "EMAIL_BACKEND": "django.core.mail.backends.dummy.EmailBackend",
        "DEFAULT_FROM_EMAIL": from_email or "GoalNexa <noreply@localhost>",
        "EMAIL_TIMEOUT": 10,
    }
    if not url:
        return result
    parts = urlsplit(url)
    scheme = parts.scheme.lower()
    if scheme == "console":
        return {**result, "EMAIL_CONFIGURED": True, "EMAIL_BACKEND": "django.core.mail.backends.console.EmailBackend"}
    if scheme not in ("smtp", "smtps"):
        raise ValueError(f"EMAIL_URL: unsupported scheme {scheme!r} (use smtp://, smtps:// or console://)")
    query = parse_qs(parts.query)
    port = parts.port or (465 if scheme == "smtps" else 587)
    tls_default = "1" if scheme == "smtp" and port == 587 else "0"
    return {
        **result,
        "EMAIL_CONFIGURED": True,
        "EMAIL_BACKEND": "django.core.mail.backends.smtp.EmailBackend",
        "EMAIL_HOST": parts.hostname or "localhost",
        "EMAIL_PORT": port,
        "EMAIL_HOST_USER": unquote(parts.username or ""),
        "EMAIL_HOST_PASSWORD": unquote(parts.password or ""),
        "EMAIL_USE_SSL": scheme == "smtps",
        "EMAIL_USE_TLS": scheme == "smtp" and query.get("tls", [tls_default])[0] in ("1", "true", "yes"),
    }
