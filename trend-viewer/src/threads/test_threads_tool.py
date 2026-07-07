import json
import subprocess
import tempfile
import unittest
from unittest import mock

import settings
from shared import accounts_tool, cache_tool
from threads import threads_tool


def _post(caption="hello"):
    return {
        "post": {
            "caption": {"text": caption},
            "like_count": 8,
            "text_post_app_info": {
                "direct_reply_count": 2,
                "repost_count": 3,
            },
            "image_versions2": {
                "candidates": [{"url": "https://img.test/threads.jpg"}]
            },
            "code": "abc123",
            "taken_at": 123,
        }
    }


class _FakeResponse:
    def __init__(self, data):
        self.data = data

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return json.dumps(self.data).encode()


class ThreadsToolTest(unittest.TestCase):
    def setUp(self):
        accounts_tool._sources.clear()
        cache_tool._cache.clear()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config_patch = mock.patch(
            "shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name
        )
        self.config_patch.start()
        threads_tool.register()

    def tearDown(self):
        self.config_patch.stop()
        self.tmpdir.cleanup()
        accounts_tool._sources.clear()
        cache_tool._cache.clear()

    def test_parse_threads_nested_post(self):
        caption = "a" * 300
        data = {"data": [{"node": {"deep": _post(caption)}}]}

        posts = threads_tool._parse_threads(data, "openai")

        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["account"], "openai")
        self.assertEqual(posts[0]["text"], "a" * 280)
        self.assertEqual(posts[0]["likes"], 8)
        self.assertEqual(posts[0]["replies"], 2)
        self.assertEqual(posts[0]["reposts"], 3)
        self.assertEqual(posts[0]["views"], 0)
        self.assertEqual(posts[0]["media"], "https://img.test/threads.jpg")
        self.assertEqual(posts[0]["url"], "https://www.threads.com/@openai/post/abc123")
        self.assertEqual(posts[0]["createdAt"], 123)

    def test_threads_lsd_and_userid_uses_ig_app_id(self):
        html = b'"LSD",[],{"token":"lsd-token"} "user_id":"42"'
        fake_result = subprocess.CompletedProcess(
            args=[], returncode=0, stdout=html, stderr=b""
        )
        with mock.patch(
            "threads.threads_tool.subprocess.run", return_value=fake_result
        ):
            lsd, user_id, lsd_error, user_id_error = threads_tool._threads_lsd_and_userid("Open AI")

        self.assertEqual(lsd, "lsd-token")
        self.assertEqual(user_id, "42")
        self.assertIsNone(lsd_error)
        self.assertIsNone(user_id_error)

    def test_fetch_threads_posts_doc_id_loop_and_user_agent_header(self):
        seen_doc_ids = []
        seen_headers = []

        def fake_urlopen(req, timeout=15):
            self.assertEqual(timeout, 12)
            body = req.data.decode()
            test_ids = ["fake_stale_id", "fake_working_id"]
            for doc_id in test_ids:
                if "doc_id=%s" % doc_id in body:
                    seen_doc_ids.append(doc_id)
                    break
            seen_headers.append(dict(req.header_items()))
            if len(seen_doc_ids) == 1:
                return _FakeResponse({"errors": [{"message": "stale doc"}]})
            return _FakeResponse({"data": {"thread": _post("ok")}})

        with (
            mock.patch(
                "threads.threads_tool._threads_lsd_and_userid",
                return_value=("lsd-token", "42", None, None),
            ),
            mock.patch("threads.threads_tool.urllib.request.urlopen", fake_urlopen),
            mock.patch(
                "threads.threads_tool._load_doc_ids",
                return_value=["fake_stale_id", "fake_working_id"],
            ),
        ):
            posts, error = threads_tool.fetch_threads_posts("openai")

        self.assertEqual(seen_doc_ids, ["fake_stale_id", "fake_working_id"])
        self.assertIsNone(error)
        self.assertEqual(posts[0]["text"], "ok")
        self.assertEqual(
            seen_headers[0]["User-agent"],
            settings.UA,
        )
        self.assertEqual(seen_headers[0]["X-ig-app-id"], threads_tool.IG_APP_ID_THREADS)

    def test_fetch_threads_posts_all_failures_and_missing_ids(self):
        with mock.patch(
            "threads.threads_tool._threads_lsd_and_userid",
            return_value=(None, "42", {"account": "openai", "kind": "parse", "code": None}, None),
        ):
            posts, error = threads_tool.fetch_threads_posts("openai")
            self.assertEqual(posts, [])
            self.assertEqual(error, {"account": "openai", "kind": "parse", "code": None})

        with (
            mock.patch(
                "threads.threads_tool._threads_lsd_and_userid",
                return_value=("lsd-token", "42", None, None),
            ),
            mock.patch(
                "threads.threads_tool.urllib.request.urlopen",
                side_effect=TimeoutError,
            ),
        ):
            posts, error = threads_tool.fetch_threads_posts("openai")
            self.assertEqual(posts, [])
            self.assertEqual(error, {"account": "openai", "kind": "timeout", "code": None})

    def test_fetch_threads_posts_doc_id_expired_flags(self):
        not_found_resp = _FakeResponse(
            {"errors": [{"message": "The GraphQL document was not found."}]}
        )
        with (
            mock.patch(
                "threads.threads_tool._threads_lsd_and_userid",
                return_value=("lsd-token", "42", None, None),
            ),
            mock.patch(
                "threads.threads_tool.urllib.request.urlopen",
                return_value=not_found_resp,
            ),
            mock.patch(
                "threads.threads_tool._flag_doc_id_expired"
            ) as mock_flag,
        ):
            posts, error = threads_tool.fetch_threads_posts("openai")
            self.assertEqual(posts, [])
            self.assertEqual(error["kind"], "doc_id_expired")
            mock_flag.assert_called_once()

    def test_get_threads_posts_cache_key_includes_accounts_tuple(self):
        path = accounts_tool.get_source("threads")["path"]
        with open(path, "w") as f:
            json.dump(["b", "a"], f)

        calls = []

        def fake_fetch(account):
            calls.append(account)
            return [{"account": account}], None

        with mock.patch(
            "threads.threads_tool.fetch_threads_posts", side_effect=fake_fetch
        ):
            posts, accounts, fetched_at, errors, cache_ttl = threads_tool.get_threads_posts(False)
            posts2, accounts2, fetched_at2, errors2, cache_ttl2 = threads_tool.get_threads_posts(False)

        self.assertEqual(accounts, ["b", "a"])
        self.assertEqual(accounts2, accounts)
        self.assertEqual(posts, [{"account": "b"}, {"account": "a"}])
        self.assertEqual(posts2, posts)
        self.assertEqual(errors, [])
        self.assertEqual(errors2, [])
        self.assertEqual(cache_ttl, 3600)
        self.assertEqual(cache_ttl2, 3600)
        self.assertEqual(fetched_at2, fetched_at)
        self.assertEqual(calls, ["b", "a"])
        self.assertIn(("threads", ("b", "a")), cache_tool._cache)

    def test_get_threads_posts_negative_error_uses_short_cache_ttl(self):
        path = accounts_tool.get_source("threads")["path"]
        with open(path, "w") as f:
            json.dump(["openai"], f)

        def fake_fetch(account):
            return [], {"account": account, "kind": "http", "code": 401}

        with mock.patch("threads.threads_tool.fetch_threads_posts", side_effect=fake_fetch):
            posts, accounts, fetched_at, errors, cache_ttl = threads_tool.get_threads_posts(False)

        self.assertEqual(posts, [])
        self.assertEqual(accounts, ["openai"])
        self.assertGreater(fetched_at, 0)
        self.assertEqual(errors, [{"account": "openai", "kind": "http", "code": 401}])
        self.assertEqual(cache_ttl, 120)


if __name__ == "__main__":
    unittest.main()
