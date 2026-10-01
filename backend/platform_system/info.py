"""Read-only facts about the deployment for the admin's System page -
what comes from the environment and can't be changed from the UI.
Secrets are never returned, only whether they're set."""

import os

from django.conf import settings
from django.db import connection
from django.db.migrations.recorder import MigrationRecorder

#: Values a host ships for development - "set" but not safe in production.
DEV_SECRETS = {"dev-secret-change-me", "dev-only-insecure-jwt-secret", "django-insecure"}


def _secret_state(value) -> str:
    if not value:
        return "missing"
    return "insecure default" if any(str(value).startswith(dev) for dev in DEV_SECRETS) else "set"


def _latest_migration() -> str:
    try:
        row = MigrationRecorder.Migration.objects.order_by("-applied").values("app", "name").first()
    except Exception:
        return ""
    return f"{row['app']}.{row['name']}" if row else ""


def system_info() -> list[dict]:
    """Groups of `{label, value, hint?}` rows."""
    db = settings.DATABASES["default"]
    engine = db["ENGINE"].rsplit(".", 1)[-1]
    rest = getattr(settings, "REST_FRAMEWORK", {})
    rates = rest.get("DEFAULT_THROTTLE_RATES", {})
    configured = getattr(settings, "EMAIL_CONFIGURED", False)
    email_host = getattr(settings, "EMAIL_HOST", "") if configured else ""
    email_backend = settings.EMAIL_BACKEND.rsplit(".", 2)[-2]
    return [
        {
            "group": "Deployment",
            "rows": [
                {"label": "Mode", "value": getattr(settings, "DEPLOYMENT_MODE", "") or "—"},
                {"label": "Version", "value": os.environ.get("APP_VERSION") or os.environ.get("GIT_COMMIT") or "—",
                 "hint": "APP_VERSION / GIT_COMMIT"},
                {"label": "Allowed hosts", "value": ", ".join(settings.ALLOWED_HOSTS) or "—"},
                {"label": "Debug", "value": "on" if settings.DEBUG else "off"},
                {"label": "Extensions", "value": ", ".join(getattr(settings, "GOALNEXA_EXTENSIONS", [])) or "none"},
                {"label": "Trusted proxies", "value": str(rest.get("NUM_PROXIES", 0)), "hint": "TRUSTED_PROXY_COUNT"},
            ],
        },
        {
            "group": "Database",
            "rows": [
                {"label": "Engine", "value": engine},
                {"label": "Host", "value": (f"{db.get('HOST')}:{db.get('PORT')}" if db.get("HOST") else "local file")},
                {"label": "Name", "value": os.path.basename(str(db.get("NAME", ""))) if engine == "sqlite3" else str(db.get("NAME", ""))},
                {"label": "Server version", "value": _server_version()},
                {"label": "Latest migration", "value": _latest_migration() or "—"},
            ],
        },
        {
            "group": "Email",
            "rows": [
                {"label": "Configured", "value": "yes" if getattr(settings, "EMAIL_CONFIGURED", False) else "no",
                 "hint": "EMAIL_URL"},
                {"label": "Backend", "value": email_backend},
                {"label": "Server", "value": f"{email_host}:{getattr(settings, 'EMAIL_PORT', '')}" if email_host else "—"},
                {"label": "User", "value": getattr(settings, "EMAIL_HOST_USER", "") or "—"},
                {"label": "Encryption", "value": "SSL" if getattr(settings, "EMAIL_USE_SSL", False)
                 else "STARTTLS" if getattr(settings, "EMAIL_USE_TLS", False) else "none"},
                {"label": "From address", "value": settings.DEFAULT_FROM_EMAIL, "hint": "EMAIL_FROM"},
            ],
        },
        {
            "group": "Secrets",
            "rows": [
                {"label": "Django secret key", "value": _secret_state(settings.SECRET_KEY), "hint": "DJANGO_SECRET_KEY"},
                {"label": "Login token secret", "value": _secret_state(getattr(settings, "JWT_SECRET", "")), "hint": "JWT_SECRET"},
                {"label": "Email password", "value": "set" if getattr(settings, "EMAIL_HOST_PASSWORD", "") else "not set"},
            ],
        },
        {
            "group": "Rate limits",
            "rows": [{"label": name.replace("_", " "), "value": rate} for name, rate in sorted(rates.items())],
        },
    ]


def _server_version() -> str:
    try:
        connection.ensure_connection()
        info = connection.connection
        if connection.vendor == "postgresql":
            version = info.info.server_version
            return f"PostgreSQL {version // 10000}.{version % 10000}"
        if connection.vendor == "sqlite":
            import sqlite3

            return f"SQLite {sqlite3.sqlite_version}"
    except Exception:
        pass
    return connection.vendor
