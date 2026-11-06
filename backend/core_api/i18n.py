"""Translating the API's user-visible text at OUTPUT time.

Labels, help texts, choice labels, form layouts, settings and error
messages are written in English in the code (model `verbose_name`s,
`SettingDef`s, `ApiError("...")`). Instead of marking every one of them
with `gettext_lazy` (which, on a model, would also mean migrations), the
places that SEND them - the schema API, the exception handler, the system
pages - pass them through `tr()`, which looks them up in the active
language's catalogs (`<app>/locale/<lang>/LC_MESSAGES/django.po`, filled by
`manage.py collect_ui_strings`). A string with no translation comes back
unchanged, so English output is exactly what the code says.

A message built from values (`f"... {limit} ..."`) can't be looked up
whole: write it as `gettext("... {limit} ...").format(limit=...)` where
it's raised instead - `collect_ui_strings` finds `gettext()` calls too.
"""

from django.utils.translation import gettext

#: The keys of a form layout (`Meta.form_layout`), an Insights/Status
#: block or a System info group whose values are text for people;
#: everything else (field names, `show_if` values, widget names) is left
#: alone.
TEXT_KEYS = frozenset({"title", "description", "label", "group", "help", "help_text", "placeholder", "empty", "hint"})


def tr(text):
    """`text` (a string or lazy string) in the active language, or
    unchanged. Never looks up "" - that would answer the catalog's header."""
    if text is None:
        return text
    text = str(text)  # a lazy string (`gettext_lazy`) too
    return gettext(text) if text else text


def tr_texts(value):
    """A copy of a JSON-like structure (form layout, Insights blocks) with
    every `TEXT_KEYS` string translated."""
    if isinstance(value, list):
        return [tr_texts(item) for item in value]
    if isinstance(value, dict):
        return {
            key: tr(item) if key in TEXT_KEYS and isinstance(item, str) else tr_texts(item)
            for key, item in value.items()
        }
    return value


def texts_in(value, found: list) -> list:
    """Every `TEXT_KEYS` string in a JSON-like structure, appended to
    `found` - what `collect_ui_strings` takes from a form layout."""
    if isinstance(value, list):
        for item in value:
            texts_in(item, found)
    elif isinstance(value, dict):
        for key, item in value.items():
            if key in TEXT_KEYS and isinstance(item, str):
                if item:
                    found.append(item)
            else:
                texts_in(item, found)
    return found
