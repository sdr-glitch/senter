import json
import os
import tempfile
import unittest
from unittest import mock

from shared import accounts_tool


class AccountsToolTest(unittest.TestCase):
    def setUp(self):
        accounts_tool._sources.clear()
        self.tmpdir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmpdir.cleanup()
        accounts_tool._sources.clear()

    def path(self, name):
        return os.path.join(self.tmpdir.name, name)

    def test_load_save_roundtrip(self):
        path = self.path("accounts.json")
        accounts_tool.save_accounts(path, ["a", "b"])
        self.assertEqual(accounts_tool.load_accounts(path, ["default"]), ["a", "b"])

    def test_load_corrupt_json_falls_back_to_defaults(self):
        path = self.path("bad.json")
        with open(path, "w") as f:
            f.write("{bad")
        self.assertEqual(accounts_tool.load_accounts(path, ["fallback"]), ["fallback"])

    def test_registry_add_remove_lowercases_by_default(self):
        with mock.patch("shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name):
            accounts_tool.register_source("reels", "reels.json", ["openai"])
            self.assertEqual(
                accounts_tool.update_accounts("reels", "add", " @RunwayApp "),
                ["openai", "runwayapp"],
            )
            self.assertEqual(
                accounts_tool.update_accounts("reels", "remove", "RUNWAYAPP"),
                ["openai"],
            )

        with open(self.path("reels.json")) as f:
            self.assertEqual(json.load(f), ["openai"])

    def test_registry_preserves_case_for_x(self):
        with mock.patch("shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name):
            accounts_tool.register_source("x", "x.json", ["OpenAI"], preserve_case=True)
            accounts = accounts_tool.update_accounts("x", "add", "@Kling_ai")

        self.assertEqual(accounts, ["OpenAI", "Kling_ai"])

    def test_unknown_source(self):
        self.assertIsNone(accounts_tool.get_source("missing"))
        with self.assertRaises(KeyError):
            accounts_tool.update_accounts("missing", "add", "x")


if __name__ == "__main__":
    unittest.main()
