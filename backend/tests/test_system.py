"""`core_api.system` without `platform_system` installed (a module's own
deployment) and `core_api.email_url`."""

import os
from unittest import mock

from django.core import mail
from django.test import SimpleTestCase, override_settings

from core_api.email_url import email_settings
from core_api.system import BOOL, CHOICE, LIST, SettingDef, audit, get_setting, register_setting, send_email

register_setting(SettingDef("test.flag", "Flag", BOOL, default=False, env="TEST_FLAG"))
register_setting(SettingDef("test.mode", "Mode", CHOICE, default="a", choices=[("a", "A"), ("b", "B")], env="TEST_MODE"))
register_setting(SettingDef("test.items", "Items", LIST, default=[], env="TEST_ITEMS"))


class SettingsFallbackTests(SimpleTestCase):
    def test_default_host_default_and_env(self):
        self.assertFalse(get_setting("test.flag"))
        with override_settings(SYSTEM_SETTING_DEFAULTS={"test.flag": True}):
            self.assertTrue(get_setting("test.flag"))
        with mock.patch.dict(os.environ, {"TEST_FLAG": "yes", "TEST_ITEMS": "a.com, b.com\nc.com", "TEST_MODE": "b"}):
            self.assertTrue(get_setting("test.flag"))
            self.assertEqual(get_setting("test.items"), ["a.com", "b.com", "c.com"])
            self.assertEqual(get_setting("test.mode"), "b")

    def test_invalid_env_value_is_ignored(self):
        with mock.patch.dict(os.environ, {"TEST_MODE": "zzz"}):
            self.assertEqual(get_setting("test.mode"), "a")

    def test_unknown_setting(self):
        with self.assertRaises(KeyError):
            get_setting("test.nope")

    def test_audit_is_a_no_op_and_email_sends_directly(self):
        audit("anything", target_label="x")
        send_email("a@example.com", "Hi", "Body", html="<p>Body</p>")
        self.assertEqual(mail.outbox[-1].subject, "Hi")


class EmailUrlTests(SimpleTestCase):
    def test_parsing(self):
        self.assertFalse(email_settings(None)["EMAIL_CONFIGURED"])
        smtp = email_settings("smtp://me%40x.com:p%2Fw@mail.example.com:587", "Me <me@x.com>")
        self.assertEqual(
            (smtp["EMAIL_HOST"], smtp["EMAIL_PORT"], smtp["EMAIL_HOST_USER"], smtp["EMAIL_HOST_PASSWORD"], smtp["EMAIL_USE_TLS"]),
            ("mail.example.com", 587, "me@x.com", "p/w", True),
        )
        self.assertEqual(smtp["DEFAULT_FROM_EMAIL"], "Me <me@x.com>")
        ssl = email_settings("smtps://u:p@h")
        self.assertEqual((ssl["EMAIL_PORT"], ssl["EMAIL_USE_SSL"], ssl["EMAIL_USE_TLS"]), (465, True, False))
        self.assertFalse(email_settings("smtp://h:25")["EMAIL_USE_TLS"])
        self.assertIn("console", email_settings("console://")["EMAIL_BACKEND"])
        with self.assertRaises(ValueError):
            email_settings("http://nope")
