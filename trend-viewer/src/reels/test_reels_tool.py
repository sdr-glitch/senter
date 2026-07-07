import json
import os
import subprocess
import tempfile
import unittest
from unittest import mock

from reels import reels_tool
from shared import accounts_tool, cache_tool


def _graphql_response(shortcode, caption="caption", views=42):
    """Minimal GraphQL response with one reel node."""
    return {
        "data": {
            "xdt_api__v1__clips__user__connection_v2": {
                "edges": [{
                    "node": {
                        "media": {
                            "is_video": True,
                            "code": shortcode,
                            "caption": {"text": caption},
                            "video_view_count": views,
                            "like_count": 7,
                            "comment_count": 3,
                            "thumbnail_src": "https://img.test/thumb.jpg",
                            "taken_at": 123,
                        }
                    }
                }]
            }
        }
    }


def _make_curl_result(data, returncode=0):
    return subprocess.CompletedProcess(
        args=["curl"], returncode=returncode,
        stdout=json.dumps(data).encode() if isinstance(data, dict) else data,
        stderr=b"",
    )


def _profile_html(user_id="12345"):
    return subprocess.CompletedProcess(
        args=["curl"], returncode=0,
        stdout=('{"user_id": "%s"}' % user_id).encode(),
        stderr=b"",
    )


class ReelsGraphQLTest(unittest.TestCase):
    def setUp(self):
        accounts_tool._sources.clear()
        cache_tool._cache.clear()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config_patch = mock.patch(
            "shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name
        )
        self.settings_patch = mock.patch(
            "reels.reels_tool.settings.CONFIG_DIR", self.tmpdir.name
        )
        self.config_patch.start()
        self.settings_patch.start()
        # Patch module-level path constants that were computed at import time
        self._doc_id_config_patch = mock.patch.object(
            reels_tool, "_DOC_ID_CONFIG",
            os.path.join(self.tmpdir.name, "reels_doc_ids.json"),
        )
        self._doc_id_flag_patch = mock.patch.object(
            reels_tool, "_DOC_ID_EXPIRED_FLAG",
            os.path.join(self.tmpdir.name, ".reels_docid_expired"),
        )
        self._doc_id_config_patch.start()
        self._doc_id_flag_patch.start()
        reels_tool.register()

    def tearDown(self):
        self._doc_id_flag_patch.stop()
        self._doc_id_config_patch.stop()
        self.settings_patch.stop()
        self.config_patch.stop()
        self.tmpdir.cleanup()
        accounts_tool._sources.clear()
        cache_tool._cache.clear()

    def test_graphql_parses_reels(self):
        """GraphQL path extracts reel metadata correctly."""
        profile = _profile_html("12345")
        gql_resp = _make_curl_result(_graphql_response("ABC", "test reel", 100))

        def side_effect(*args, **kwargs):
            cmd = args[0]
            url = cmd[-1] if isinstance(cmd, list) else ""
            if "instagram.com/openai" in str(cmd):
                return profile
            return gql_resp

        with mock.patch("subprocess.run", side_effect=side_effect):
            reels, error = reels_tool.fetch_ig_reels_graphql("openai")

        self.assertIsNone(error)
        self.assertEqual(len(reels), 1)
        self.assertEqual(reels[0]["account"], "openai")
        self.assertEqual(reels[0]["title"], "test reel")
        self.assertEqual(reels[0]["views"], 100)
        self.assertEqual(reels[0]["likes"], 7)
        self.assertEqual(reels[0]["comments"], 3)
        self.assertEqual(reels[0]["url"], "https://www.instagram.com/reel/ABC/")

    def test_graphql_user_id_not_found(self):
        """Returns parse error when user_id cannot be extracted."""
        no_uid = subprocess.CompletedProcess(
            args=["curl"], returncode=0,
            stdout=b"<html>no user id here</html>", stderr=b"",
        )
        with mock.patch("subprocess.run", return_value=no_uid):
            reels, error = reels_tool.fetch_ig_reels_graphql("nobody")

        self.assertEqual(reels, [])
        self.assertEqual(error["kind"], "parse")

    def test_graphql_doc_id_expired_flags(self):
        """All doc_ids returning 'not found' triggers expiry flag."""
        profile = _profile_html("12345")
        expired = _make_curl_result(
            {"errors": [{"message": "Query not found"}]}
        )

        call_count = [0]

        def side_effect(*args, **kwargs):
            cmd = args[0]
            if "instagram.com/openai" in str(cmd):
                return profile
            call_count[0] += 1
            return expired

        with mock.patch("subprocess.run", side_effect=side_effect):
            reels, error = reels_tool.fetch_ig_reels_graphql("openai")

        self.assertEqual(reels, [])
        self.assertEqual(error["kind"], "doc_id_expired")
        flag_path = os.path.join(self.tmpdir.name, ".reels_docid_expired")
        self.assertTrue(os.path.exists(flag_path))

    def test_graphql_require_login(self):
        """require_login response treated as 401."""
        profile = _profile_html("12345")
        login_req = _make_curl_result({"require_login": True})

        def side_effect(*args, **kwargs):
            cmd = args[0]
            if "instagram.com/openai" in str(cmd):
                return profile
            return login_req

        with mock.patch("subprocess.run", side_effect=side_effect):
            reels, error = reels_tool.fetch_ig_reels_graphql("openai")

        self.assertEqual(reels, [])
        self.assertEqual(error["kind"], "http")
        self.assertEqual(error["code"], 401)

    def test_doc_id_config_file(self):
        """Config file doc_ids override defaults."""
        config_path = os.path.join(self.tmpdir.name, "reels_doc_ids.json")
        with open(config_path, "w") as f:
            json.dump(["custom123"], f)

        ids = reels_tool._load_doc_ids()
        self.assertEqual(ids, ["custom123"])


class ReelsPopularTest(unittest.TestCase):
    def test_popular_fallback_extracts_shortcodes(self):
        """Popular page fallback extracts unique reel shortcodes."""
        html = (
            '<a href="/reel/AAAA/">link</a>'
            '<a href="/reel/BBBB/">link2</a>'
            '<a href="/reel/AAAA/">dup</a>'
        )

        def fake_curl(url):
            return html

        with mock.patch("reels.reels_tool._curl_ig_page", side_effect=fake_curl):
            reels = reels_tool.fetch_popular_reels()

        codes = [r["url"].split("/reel/")[1].rstrip("/") for r in reels]
        # Each topic produces AAAA + BBBB (deduped per topic)
        self.assertTrue(len(reels) >= 2)
        # First topic should have AAAA and BBBB
        first_topic_codes = [r for r in reels if r["account"] == "ai"]
        self.assertEqual(len(first_topic_codes), 2)

    def test_popular_fallback_curl_failure(self):
        """Returns empty when curl fails for all topics."""
        with mock.patch("reels.reels_tool._curl_ig_page", return_value=None):
            reels = reels_tool.fetch_popular_reels()
        self.assertEqual(reels, [])


class ReelsIntegrationTest(unittest.TestCase):
    def setUp(self):
        accounts_tool._sources.clear()
        cache_tool._cache.clear()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.config_patch = mock.patch(
            "shared.accounts_tool.settings.CONFIG_DIR", self.tmpdir.name
        )
        self.settings_patch = mock.patch(
            "reels.reels_tool.settings.CONFIG_DIR", self.tmpdir.name
        )
        self.config_patch.start()
        self.settings_patch.start()
        reels_tool.register()

    def tearDown(self):
        self.settings_patch.stop()
        self.config_patch.stop()
        self.tmpdir.cleanup()
        accounts_tool._sources.clear()
        cache_tool._cache.clear()

    def test_get_reels_sorts_and_caches(self):
        path = accounts_tool.get_source("reels")["path"]
        with open(path, "w") as f:
            json.dump(["b", "a"], f)

        calls = []

        def fake_fetch(account):
            calls.append(account)
            return [{"id": account, "views": 10 if account == "a" else 3}], None

        with mock.patch("reels.reels_tool.fetch_ig_reels_graphql", side_effect=fake_fetch):
            reels, accounts, fetched_at, errors, cache_ttl = reels_tool.get_reels(False)
            reels2, _, fetched_at2, errors2, cache_ttl2 = reels_tool.get_reels(False)

        self.assertEqual(accounts, ["b", "a"])
        self.assertEqual([r["id"] for r in reels], ["a", "b"])
        self.assertEqual(reels2, reels)
        self.assertEqual(errors, [])
        self.assertEqual(cache_ttl, 3600)
        self.assertEqual(fetched_at2, fetched_at)
        self.assertEqual(calls, ["b", "a"])

    def test_get_reels_negative_cache_on_errors(self):
        path = accounts_tool.get_source("reels")["path"]
        with open(path, "w") as f:
            json.dump(["openai"], f)

        def fake_fetch(account):
            return [], {"account": account, "kind": "http", "code": 401}

        with mock.patch("reels.reels_tool.fetch_ig_reels_graphql", side_effect=fake_fetch):
            with mock.patch("reels.reels_tool.fetch_popular_reels", return_value=[]):
                reels, accounts, fetched_at, errors, cache_ttl = reels_tool.get_reels(False)

        self.assertEqual(reels, [])
        self.assertEqual(errors, [{"account": "openai", "kind": "http", "code": 401}])
        self.assertEqual(cache_ttl, 120)

    def test_get_reels_popular_fallback_on_empty_graphql(self):
        """When GraphQL returns nothing, popular fallback kicks in."""
        path = accounts_tool.get_source("reels")["path"]
        with open(path, "w") as f:
            json.dump(["openai"], f)

        def fake_graphql(account):
            return [], {"account": account, "kind": "http", "code": 401}

        popular_data = [{
            "account": "ai", "title": "Popular: ai", "views": 0,
            "likes": 0, "comments": 0, "thumbnail": "",
            "url": "https://www.instagram.com/reel/XYZ/", "takenAt": 0,
        }]

        with mock.patch("reels.reels_tool.fetch_ig_reels_graphql", side_effect=fake_graphql):
            with mock.patch("reels.reels_tool.fetch_popular_reels", return_value=popular_data):
                reels, _, _, errors, _ = reels_tool.get_reels(True)

        self.assertEqual(len(reels), 1)
        self.assertEqual(reels[0]["url"], "https://www.instagram.com/reel/XYZ/")


if __name__ == "__main__":
    unittest.main()
