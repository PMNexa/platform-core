"""`manage.py collect_ui_strings` - writes the API's user-visible English
texts into each app's `locale/<lang>/LC_MESSAGES/django.po`, keeping the
translations already there.

The texts are written in plain English in the code and translated where
they're SENT (core_api/i18n.py), so Django's `makemessages` (which only
finds `gettext()` calls) misses most of them. This command collects:

- every `BaseViewSet` resource's schema (`describe_resource`, in English):
  model and field labels, help texts, choice labels, form layouts;
- system settings, email categories, session providers, usage and
  Insights registrations (`core_api.system`), filed under the app of the
  module that registered each one;
- from each app's Python source: `gettext()`/`gettext_noop()`/
  `gettext_lazy()` strings, literal messages of raised errors
  (`ApiError`, `ValidationError`, `PermissionDenied`, `ValueError`, ...,
  an error class's `super().__init__(...)`, and `message=` parameter
  defaults), and literal `label`/`hint`/`empty`
  values (and a block's `title`) of Insights/Status dicts.

A message built with an f-string can't be found (or looked up) - write it
as `gettext("... {name} ...").format(name=...)`.

Then translate the empty `msgstr`s and compile: `msgfmt -o django.mo
django.po` next to each file (the images have no gettext tools, so the
`.mo` files are committed). `--check` changes nothing and fails when a
`.po` file is out of date or has an untranslated entry - for CI.
"""

from __future__ import annotations

import ast
import os
import re
from collections import defaultdict
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.urls import get_resolver
from django.utils import translation

from core_api import i18n, system
from core_api.registry import _viewsets

#: Raised exceptions whose literal message is never shown to a user.
_NOT_USER_FACING = {
    "KeyError", "TypeError", "RuntimeError", "ImproperlyConfigured", "CommandError", "OSError",
    "AttributeError", "NotImplementedError", "AssertionError", "ImportError", "LookupError",
    "IntegrityError", "_RpcError", "IndexError", "SystemExit",
}
_ERROR_NAMES = {
    "ApiError", "ValidationError", "PermissionDenied", "NotFound", "NotAuthenticated", "AuthenticationFailed",
    "ParseError", "Throttled", "MethodNotAllowed", "Unauthorized", "NotFoundError", "PermissionDeniedError",
    "ConflictError", "RateLimitedError",
}
_GETTEXT = {"gettext", "gettext_lazy", "gettext_noop", "_"}
_CODE = re.compile(r"^[a-z0-9_.:/-]*$")  # an error code, a field name, a path - not a sentence
_ENV_NAME = re.compile(r"^[A-Z0-9_ /]+$")  # "DJANGO_SECRET_KEY", "APP_VERSION / GIT_COMMIT" - a hint naming a variable


def _looks_like_text(value: str) -> bool:
    text = value.strip()
    if not text or not re.search(r"[A-Za-z]", text) or _CODE.match(text):
        return False
    return (" " in text or text.endswith(".")) and not text.startswith(("http://", "https://", "/"))


def _call_name(node: ast.Call) -> str:
    func = node.func
    return func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")


def _is_super_init(node: ast.Call) -> bool:
    """`super().__init__(...)` - an error class passing its fixed message up."""
    func = node.func
    return (isinstance(func, ast.Attribute) and func.attr == "__init__" and isinstance(func.value, ast.Call)
            and getattr(func.value.func, "id", "") == "super")


def _literals(node, found: list) -> None:
    """String constants in an error's arguments - not dict keys, f-strings,
    `"..." % x` or `"...".format()` (they can't be looked up whole)."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        found.append((node.value, node.lineno))
    elif isinstance(node, ast.Dict):
        for value in node.values:
            _literals(value, found)
    elif isinstance(node, (ast.List, ast.Tuple, ast.Set)):
        for item in node.elts:
            _literals(item, found)
    elif isinstance(node, ast.IfExp):
        _literals(node.body, found)
        _literals(node.orelse, found)
    elif isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add):
        _literals(node.left, found)
        _literals(node.right, found)


def source_strings(path: Path) -> list[tuple[str, int]]:
    """The user-visible literals in one Python file - see the module docstring."""
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return []
    found: list[tuple[str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = _call_name(node)
            if name in _GETTEXT:
                if node.args and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str):
                    found.append((node.args[0].value, node.lineno))
            elif name not in _NOT_USER_FACING and (name in _ERROR_NAMES or name.endswith("Error") or _is_super_init(node)):
                candidates: list = []
                for arg in node.args:
                    _literals(arg, candidates)
                for keyword in node.keywords:
                    if keyword.arg in (None, "message", "detail"):
                        _literals(keyword.value, candidates)
                found.extend((text, line) for text, line in candidates if _looks_like_text(text))
        elif isinstance(node, ast.Dict):
            keys = {k.value: v for k, v in zip(node.keys, node.values) if isinstance(k, ast.Constant)}
            wanted = {"label", "hint", "empty"} | ({"title"} if "kind" in keys else set()) | (
                {"group"} if "rows" in keys else set())
            for key in wanted & set(keys):
                value = keys[key]
                if (isinstance(value, ast.Constant) and isinstance(value.value, str) and value.value.strip()
                        and not _ENV_NAME.match(value.value)):
                    found.append((value.value, value.lineno))
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = node.args
            positional = args.posonlyargs + args.args
            for arg, default in zip(positional[len(positional) - len(args.defaults):], args.defaults):
                if arg.arg == "message" and isinstance(default, ast.Constant) and isinstance(default.value, str):
                    found.append((default.value, default.lineno))
    return found


# --- .po files ---------------------------------------------------------------

def _po_unquote(line: str) -> str:
    return ast.literal_eval(line)  # a .po string is a valid Python string literal


def _po_quote(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace('"', '\\"').replace("\t", "\\t")
    if "\n" not in escaped:
        return '"' + escaped + '"'
    parts = escaped.split("\n")
    lines = [part + "\\n" for part in parts[:-1]] + ([parts[-1]] if parts[-1] else [])
    return '""\n' + "\n".join('"' + line + '"' for line in lines)


def read_po(path: Path) -> dict[str, str]:
    """msgid -> msgstr of an existing .po file (the header left out)."""
    if not path.exists():
        return {}
    entries: dict[str, str] = {}
    msgid = msgstr = None
    target = None
    for raw in path.read_text(encoding="utf-8").splitlines() + [""]:
        line = raw.strip()
        if line.startswith("msgid "):
            if msgid is not None and msgstr is not None:
                entries[msgid] = msgstr
            msgid, msgstr, target = _po_unquote(line[6:]), None, "id"
        elif line.startswith("msgstr "):
            msgstr, target = _po_unquote(line[7:]), "str"
        elif line.startswith('"') and target:
            if target == "id":
                msgid += _po_unquote(line)
            else:
                msgstr += _po_unquote(line)
        elif not line or line.startswith("#"):
            target = None if not line else target
    if msgid is not None and msgstr is not None:
        entries[msgid] = msgstr
    entries.pop("", None)
    return entries


def render_po(app_label: str, language: str, entries: dict[str, str], refs: dict[str, list[str]]) -> str:
    out = [
        f"# {app_label}: the API's user-visible texts. Written by `manage.py collect_ui_strings`;",
        "# fill in msgstr, then `msgfmt -o django.mo django.po`.",
        'msgid ""',
        'msgstr ""',
        f'"Project-Id-Version: {app_label}\\n"',
        f'"Language: {language}\\n"',
        '"MIME-Version: 1.0\\n"',
        '"Content-Type: text/plain; charset=UTF-8\\n"',
        '"Content-Transfer-Encoding: 8bit\\n"',
        '"Plural-Forms: nplurals=1; plural=0;\\n"' if language == "vi" else '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
        "",
    ]
    for msgid in sorted(entries, key=lambda m: (m.lower(), m)):
        for ref in sorted(set(refs.get(msgid, [])))[:3]:
            out.append(f"#: {ref}")
        out.append("msgid " + _po_quote(msgid))
        out.append("msgstr " + _po_quote(entries[msgid]))
        out.append("")
    return "\n".join(out)


# --- collecting ----------------------------------------------------------------

class Command(BaseCommand):
    help = "Write the API's user-visible texts into each app's locale/<lang>/LC_MESSAGES/django.po."

    def add_arguments(self, parser):
        parser.add_argument("--check", action="store_true",
                            help="Change nothing; fail if a .po file is out of date or has an untranslated entry.")

    def handle(self, *args, check=False, **options):
        self.root = Path(settings.BASE_DIR).resolve().parent.parent  # the repo's apps/
        self.texts: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))
        get_resolver().url_patterns  # imports every urls.py: fills the viewset registry
        with translation.override(settings.LANGUAGE_CODE):
            self._schemas()
            self._registries()
            self._sources()

        languages = [code for code, _ in settings.LANGUAGES if code != settings.LANGUAGE_CODE]
        problems = []
        for label, texts in sorted(self.texts.items()):
            app = apps.get_app_config(label)
            for language in languages:
                path = Path(app.path) / "locale" / language / "LC_MESSAGES" / "django.po"
                old = read_po(path)
                entries = {msgid: old.get(msgid, "") for msgid in texts}
                content = render_po(label, language, entries, texts)
                missing = sum(1 for value in entries.values() if not value)
                dropped = len(set(old) - set(entries))
                current = path.read_text(encoding="utf-8") if path.exists() else None
                rel = os.path.relpath(path, self.root)
                if check:
                    if current != content:
                        problems.append(f"{rel}: out of date - run collect_ui_strings")
                    if missing:
                        problems.append(f"{rel}: {missing} untranslated")
                    continue
                if current != content:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(content, encoding="utf-8")
                self.stdout.write(f"{rel}: {len(entries)} strings, {missing} untranslated, {dropped} dropped")
        if problems:
            raise CommandError("\n".join(problems))

    def _ours(self, app) -> bool:
        """An app of this repo (not Django's, DRF's, ...)."""
        path = Path(app.path).resolve()
        try:
            path.relative_to(self.root)
        except ValueError:
            return False
        return "site-packages" not in path.parts

    def _add(self, label: str | None, text, ref: str) -> None:
        text = str(text) if text is not None else ""
        if label and re.search(r"[^\W\d_]", text):  # something to translate
            self.texts[label][text].append(ref)

    def _label_for_module(self, module: str) -> str | None:
        """The app a module belongs to; `core_api` (no app of its own) files
        under `platform_system`, from the same package."""
        if module.split(".")[0] == "core_api":
            module = "platform_system"
        app = apps.get_containing_app_config(module)
        return app.label if app is not None and self._ours(app) else None

    def _schemas(self):
        for model, viewset_class in sorted(_viewsets.items(), key=lambda item: item[0]._meta.label):
            app = apps.get_app_config(model._meta.app_label)
            if not self._ours(app):
                continue
            try:
                schema = viewset_class().describe_resource()
            except Exception as exc:  # noqa: BLE001 - one resource mustn't stop the rest
                self.stderr.write(f"{viewset_class.__name__}: schema skipped ({exc})")
                continue
            ref = f"schema {model._meta.label}"
            self._add(app.label, schema["label"], ref)
            self._add(app.label, schema["label_plural"], ref)
            for text in i18n.texts_in(schema.get("form_layout") or [], []):
                self._add(app.label, text, f"{ref} form_layout")
            self._fields(app.label, schema["fields"], ref)

    def _fields(self, label, fields, ref):
        for field in fields:
            where = f"{ref}.{field.get('name', 'item')}"
            self._add(label, field.get("label"), where)
            self._add(label, field.get("help_text"), where)
            for choice in field.get("choices") or []:
                self._add(label, choice.get("label"), where)
            items = field.get("items")
            if items:
                self._fields(label, items.get("fields") or [items], where)
            self._fields(label, field.get("through_fields") or [], where)

    def _registries(self):
        def owner(registry, key):
            return self._label_for_module(system.registered_by(registry, key))

        for d in system.setting_definitions():
            label = owner("setting", d.key)
            for text in (d.label, d.help, d.group, *(choice_label for _, choice_label in d.choices or [])):
                self._add(label, text, f"setting {d.key}")
        for c in system.email_categories():
            label = owner("email_category", c.key)
            self._add(label, c.label, f"email category {c.key}")
            self._add(label, c.help, f"email category {c.key}")
        for p in system.session_providers():
            self._add(owner("session_provider", p.kind), p.label, f"session provider {p.kind}")
        for p in system.usage_providers():
            self._add(owner("usage_provider", p.group), p.group, "usage provider")
        for s in system.insight_series():
            label = owner("insight_series", s.key)
            for text in (s.label, s.group, s.help):
                self._add(label, text, f"insight {s.key}")
        for s in system.insight_sections():
            label = owner("insight_section", s.key)
            self._add(label, s.title, f"insight section {s.key}")
            self._add(label, s.description, f"insight section {s.key}")
        # Written by the system pages themselves.
        for text in ("Request failed validation.", "Request failed.", "Error", "couldn't compute"):
            self._add("platform_system", text, "core_api")

    def _sources(self):
        skip_dirs = {"migrations", "tests", "management", "__pycache__", "locale", "node_modules"}
        roots = {app.label: [Path(app.path)] for app in apps.get_app_configs() if self._ours(app)}
        if "platform_system" in roots:
            import core_api

            roots["platform_system"].append(Path(core_api.__file__).parent)
        for label, paths in roots.items():
            for base in paths:
                for directory, subdirs, files in os.walk(base):
                    subdirs[:] = [d for d in subdirs if d not in skip_dirs]
                    for name in files:
                        if not name.endswith(".py") or name.startswith("test") or name == "conftest.py":
                            continue
                        path = Path(directory) / name
                        rel = os.path.relpath(path, self.root)
                        for text, line in source_strings(path):
                            self._add(label, text, f"{rel}:{line}")
