"""`core_api.system.run_system_jobs` - periodic work for the host's scheduler."""

from platform_system.insights import run_daily
from platform_system.mail import retry_due


def run() -> dict:
    return {"emails_sent": retry_due(), **run_daily()}
