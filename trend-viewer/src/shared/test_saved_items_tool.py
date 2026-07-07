"""Tests for saved_items_tool."""

import json
import os
import shutil
import tempfile
import unittest

import settings
from shared import saved_items_tool


class TestSavedItems(unittest.TestCase):
    def setUp(self):
        self._orig = saved_items_tool.SAVED_FILE
        self._tmpdir = tempfile.mkdtemp()
        saved_items_tool.SAVED_FILE = os.path.join(self._tmpdir, "saved.json")

    def tearDown(self):
        saved_items_tool.SAVED_FILE = self._orig
        shutil.rmtree(self._tmpdir, ignore_errors=True)

    def test_empty_list(self):
        self.assertEqual(saved_items_tool.list_items(), [])

    def test_add_and_list(self):
        items, added = saved_items_tool.add_item("youtube", "Test", "https://yt/1")
        self.assertTrue(added)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["source"], "youtube")
        self.assertEqual(items[0]["url"], "https://yt/1")
        self.assertIn("id", items[0])
        self.assertIn("savedAt", items[0])
        self.assertEqual(len(saved_items_tool.list_items()), 1)

    def test_dedupe_by_url(self):
        saved_items_tool.add_item("youtube", "A", "https://yt/1")
        items, added = saved_items_tool.add_item("youtube", "B", "https://yt/1")
        self.assertFalse(added)
        self.assertEqual(len(items), 1)

    def test_remove(self):
        items, _ = saved_items_tool.add_item("x", "Post", "https://x/1")
        item_id = items[0]["id"]
        items, removed = saved_items_tool.remove_item(item_id)
        self.assertTrue(removed)
        self.assertEqual(len(items), 0)

    def test_remove_nonexistent(self):
        saved_items_tool.add_item("x", "Post", "https://x/1")
        items, removed = saved_items_tool.remove_item("nonexistent")
        self.assertFalse(removed)
        self.assertEqual(len(items), 1)

    def test_corrupt_file_fallback(self):
        with open(saved_items_tool.SAVED_FILE, "w") as f:
            f.write("{invalid")
        self.assertEqual(saved_items_tool.list_items(), [])

    def test_insert_order(self):
        saved_items_tool.add_item("youtube", "First", "https://yt/1")
        saved_items_tool.add_item("tiktok", "Second", "https://tt/2")
        items = saved_items_tool.list_items()
        self.assertEqual(items[0]["title"], "Second")
        self.assertEqual(items[1]["title"], "First")


if __name__ == "__main__":
    unittest.main()
