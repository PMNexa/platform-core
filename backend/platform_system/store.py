"""Saved system settings (`SystemSetting`), read through
`core_api.system.get_setting`. Read once per request (the cache is
dropped when a request starts - apps.py) and at most every few seconds
outside one (the scheduler), so a change saved on one worker shows on
every other worker's next request."""

import time

from core_api.system import env_value, parse_setting, setting_definition

from platform_system.models import SystemSetting

_TTL = 5.0
_cache: dict = {"at": 0.0, "values": {}}


def _values() -> dict:
    if time.monotonic() - _cache["at"] > _TTL:
        _cache["values"] = dict(SystemSetting.objects.values_list("key", "value"))
        _cache["at"] = time.monotonic()
    return _cache["values"]


def invalidate() -> None:
    _cache["at"] = 0.0


def stored_value(key: str) -> tuple[bool, object]:
    values = _values()
    return (key in values, values.get(key))


def save(key: str, raw, user_id: str = ""):
    """Parses, validates and stores a setting; returns the parsed value.
    Raises ValueError for a value that can't be saved, PermissionError for
    a read-only or env-locked one."""
    definition = setting_definition(key)
    if not definition.editable:
        raise PermissionError(f"{definition.label} is read-only.")
    if env_value(definition)[0]:
        raise PermissionError(f"{definition.label} is set by {definition.env} in the environment.")
    value = parse_setting(definition, raw)
    if definition.validate:
        definition.validate(value)
    SystemSetting.objects.update_or_create(key=key, defaults={"value": value, "updated_by": user_id})
    invalidate()
    return value


def reset(key: str) -> None:
    SystemSetting.objects.filter(key=key).delete()
    invalidate()
