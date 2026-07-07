import json
import tempfile
import unittest
from unittest import mock

from shared import accounts_tool, cache_tool
from tiktok import tiktok_tool


def _video(video_id, handle="openai", cover="https://img.test/cover.jpg"):
    return {
        "author": {"unique_id": handle, "nickname": "OpenAI"},
        "video_id": video_id,
        "title": "  title  ",
        "play_count": 10,
        "digg_count": 5,
        "comment_count": 2,
        "share_count": 1,
        "cover": cover,
        "origin_cover": "https://img.test/origin.jpg",
        "create_time": 123,
    }


class TiktokToolTest(unittest.TestCase):
    def setUp(self):
        accounts_tool._sources.clear()
        cache_tool._cache.clear()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config_patch = mock.patch("shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name)
        self.config_patch.start()
        tiktok_tool.register()

    def tearDown(self):
        self.config_patch.stop()
        self.tmpdir.cleanup()
        accounts_tool._sources.clear()
        cache_tool._cache.clear()

    def test_tiktok_item_mapping_and_cover_fallback(self):
        item = tiktok_tool._tiktok_item(_video("v1", cover=""))

        self.assertEqual(item["account"], "openai")
        self.assertEqual(item["name"], "OpenAI")
        self.assertEqual(item["title"], "title")
        self.assertEqual(item["views"], 10)
        self.assertEqual(item["likes"], 5)
        self.assertEqual(item["comments"], 2)
        self.assertEqual(item["shares"], 1)
        self.assertEqual(item["thumbnail"], "https://img.test/origin.jpg")
        self.assertEqual(item["url"], "https://www.tiktok.com/@openai/video/v1")
        self.assertEqual(item["id"], "v1")
        self.assertEqual(item["createdAt"], 123)

    def test_tiktok_item_coerces_non_string_author_fields(self):
        video = _video("v2")
        video["author"] = {"unique_id": {"13": 812608869}, "nickname": {"6": 1}}
        item = tiktok_tool._tiktok_item(video)

        self.assertEqual(item["account"], "")
        self.assertEqual(item["name"], "")

    def test_fetch_tiktok_user_parses_tikwm_response(self):
        captured = {}

        def fake_http_json(url, timeout=15):
            captured["url"] = url
            captured["timeout"] = timeout
            return {"data": {"videos": [_video("v1", "open ai")]}}

        with mock.patch("tiktok.tiktok_tool.http_tool.http_json", side_effect=fake_http_json):
            posts = tiktok_tool.fetch_tiktok_user("open ai")

        self.assertEqual(captured["url"], "https://www.tikwm.com/api/user/posts?unique_id=open%20ai&count=12")
        self.assertEqual(captured["timeout"], 15)
        self.assertEqual(posts[0]["id"], "v1")
        self.assertEqual(posts[0]["account"], "open ai")

    def test_fetch_tiktok_trending_parses_tikwm_response(self):
        captured = {}

        def fake_http_json(url, timeout=15):
            captured["url"] = url
            captured["timeout"] = timeout
            return {"data": [_video("trend")]}

        with mock.patch("tiktok.tiktok_tool.http_tool.http_json", side_effect=fake_http_json):
            posts = tiktok_tool.fetch_tiktok_trending()

        self.assertEqual(captured["url"], "https://www.tikwm.com/api/feed/list?region=KR&count=20")
        self.assertEqual(captured["timeout"], 15)
        self.assertEqual(posts[0]["id"], "trend")

    def test_tiktok_fetch_exception_fallbacks(self):
        with mock.patch("tiktok.tiktok_tool.http_tool.http_json", side_effect=TimeoutError):
            self.assertEqual(tiktok_tool.fetch_tiktok_user("openai"), [])
            self.assertEqual(tiktok_tool.fetch_tiktok_trending(), [])

    def test_get_tiktok_dedupes_and_cache_key_includes_accounts_tuple(self):
        path = accounts_tool.get_source("tiktok")["path"]
        with open(path, "w") as f:
            json.dump(["b", "a"], f)

        calls = []

        def fake_user(account):
            calls.append(account)
            return [
                tiktok_tool._tiktok_item(_video("dup", account)),
                tiktok_tool._tiktok_item(_video(account, account)),
            ]

        with (
            mock.patch(
                "tiktok.tiktok_tool.fetch_tiktok_trending",
                return_value=[tiktok_tool._tiktok_item(_video("dup", "trend"))],
            ),
            mock.patch("tiktok.tiktok_tool.fetch_tiktok_user", side_effect=fake_user),
        ):
            posts, accounts, fetched_at = tiktok_tool.get_tiktok(False)
            posts2, accounts2, fetched_at2 = tiktok_tool.get_tiktok(False)

        self.assertEqual(accounts, ["b", "a"])
        self.assertEqual(accounts2, ["b", "a"])
        self.assertEqual([p["id"] for p in posts], ["dup", "b", "a"])
        self.assertEqual(posts2, posts)
        self.assertEqual(fetched_at2, fetched_at)
        self.assertEqual(calls, ["b", "a"])
        self.assertIn(("tiktok", ("b", "a")), cache_tool._cache)


if __name__ == "__main__":
    unittest.main()
