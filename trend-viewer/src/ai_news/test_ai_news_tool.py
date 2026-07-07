from xml.sax.saxutils import escape
import unittest
from unittest import mock

from ai_news import ai_news_tool
from shared import cache_tool


def _rss(items):
    body = ["<rss><channel>"]
    for item in items:
        title, source, link, pub = item
        parts = ["<item>", f"<title>{escape(title)}</title>"]
        if source is not None:
            parts.append(f"<source>{escape(source)}</source>")
        parts.extend(
            [
                f"<link>{escape(link)}</link>",
                f"<pubDate>{escape(pub)}</pubDate>",
                "</item>",
            ]
        )
        body.append("".join(parts))
    body.append("</channel></rss>")
    return "".join(body).encode()


def _model(model_id, created_at, likes=1, downloads=2):
    return {
        "id": model_id,
        "createdAt": created_at,
        "likes": likes,
        "downloads": downloads,
    }


class AiNewsToolTest(unittest.TestCase):
    def setUp(self):
        cache_tool._cache.clear()

    def tearDown(self):
        cache_tool._cache.clear()

    def test_feed_registry_has_required_shape_and_legacy_video_queries(self):
        required = {"name", "url", "region", "category", "needs_ai_anchor"}
        self.assertGreaterEqual(len(ai_news_tool.FEED_REGISTRY), 16)
        self.assertEqual({"KR", "global"}, {feed["region"] for feed in ai_news_tool.FEED_REGISTRY})
        self.assertGreaterEqual(len({feed["name"] for feed in ai_news_tool.FEED_REGISTRY}), 3)

        for feed in ai_news_tool.FEED_REGISTRY:
            self.assertTrue(required.issubset(feed))
            self.assertIn(feed["category"], set(ai_news_tool.CATEGORIES) | {"mixed"})
            self.assertIsInstance(feed["needs_ai_anchor"], bool)

        urls = {feed["name"]: feed["url"] for feed in ai_news_tool.FEED_REGISTRY}
        self.assertIn("AI%20%EC%98%81%EC%83%81%20%EC%83%9D%EC%84%B1", urls["Google News KR video generation"])
        self.assertIn("%22AI%20video%22%20model", urls["Google News Global video generation"])
        self.assertEqual(ai_news_tool.HF_PIPELINES, ["text-to-video", "image-to-video"])

    def test_classify_news_scores_english_and_korean_headlines(self):
        cases = [
            ("OpenAI launches GPT API update", "mixed", "모델·제품"),
            ("삼성이 생성형 AI 모델 출시", "mixed", "모델·제품"),
            ("New arXiv paper reports transformer benchmark SOTA", "mixed", "연구"),
            ("AI 논문 연구 데이터셋 공개", "mixed", "연구"),
            ("AI startup funding round hits new valuation", "mixed", "산업·투자"),
            ("AI 반도체 스타트업 투자 협력 확대", "mixed", "산업·투자"),
            ("AI regulation privacy law advances", "mixed", "정책·규제"),
            ("AI 정책 규제 법안 개인정보 논의", "mixed", "정책·규제"),
        ]
        for title, default, expected in cases:
            with self.subTest(title=title):
                self.assertEqual(ai_news_tool.classify_news(title, default), expected)

        self.assertEqual(ai_news_tool.classify_news("AI market digest", "mixed"), "mixed")
        self.assertEqual(ai_news_tool.classify_news("AI market digest", "연구"), "연구")

    def test_has_ai_anchor_avoids_airport_false_positive(self):
        self.assertFalse(ai_news_tool.has_ai_anchor("Airport adds robot kiosks"))
        self.assertTrue(ai_news_tool.has_ai_anchor("AI adds robot coding assistant"))
        self.assertTrue(ai_news_tool.has_ai_anchor("Machine learning benchmark released"))
        self.assertTrue(ai_news_tool.has_ai_anchor("생성형 모델 업데이트"))

    def test_fetch_news_filters_anchor_parses_fields_and_ts_fallback(self):
        feeds = [
            {
                "name": "Anchor Feed",
                "url": "https://feed.test/rss",
                "region": "KR",
                "category": "mixed",
                "needs_ai_anchor": True,
            }
        ]
        rss = _rss(
            [
                ("Airport adds robot kiosks", "Airport Daily", "https://news.test/airport", "bad-date"),
                ("OpenAI launches GPT API update", None, "https://news.test/openai", "bad-date"),
            ]
        )

        def fake_http_get(url, timeout=15):
            self.assertEqual(timeout, 12)
            return "application/rss+xml", rss

        with (
            mock.patch.object(ai_news_tool, "FEED_REGISTRY", feeds),
            mock.patch("ai_news.ai_news_tool.http_tool.http_get", side_effect=fake_http_get),
            mock.patch("ai_news.ai_news_tool.time.time", return_value=98765.0),
        ):
            news = ai_news_tool.fetch_news()

        self.assertEqual(len(news), 1)
        self.assertEqual(news[0]["title"], "OpenAI launches GPT API update")
        self.assertEqual(news[0]["region"], "KR")
        self.assertEqual(news[0]["category"], "모델·제품")
        self.assertEqual(news[0]["source"], "Anchor Feed")
        self.assertEqual(news[0]["link"], "https://news.test/openai")
        self.assertEqual(news[0]["ts"], 98765.0)
        self.assertNotEqual(news[0]["ts"], 0)

    def test_fetch_news_caps_each_feed_dedupes_by_normalized_title_and_sorts(self):
        feeds = [
            {
                "name": "Priority Feed",
                "url": "https://feed.test/high",
                "region": "global",
                "category": "mixed",
                "needs_ai_anchor": False,
            },
            {
                "name": "Lower Feed",
                "url": "https://feed.test/low",
                "region": "KR",
                "category": "mixed",
                "needs_ai_anchor": False,
            },
        ]
        high_items = [
            ("OpenAI releases GPT-5!", None, "https://news.test/high/dupe", "Tue, 07 Jul 2026 00:00:00 +0000")
        ] + [
            (
                f"OpenAI model update {i}",
                "High",
                f"https://news.test/high/{i}",
                f"Tue, 07 Jul 2026 00:{i + 1:02d}:00 +0000",
            )
            for i in range(25)
        ]
        low_items = [
            ("openai releases gpt 5", "Low", "https://news.test/low/dupe", "Tue, 07 Jul 2026 23:59:00 +0000"),
            ("Gemini product launch", "Low", "https://news.test/low/new", "Tue, 07 Jul 2026 23:58:00 +0000"),
        ]

        def fake_http_get(url, timeout=15):
            self.assertEqual(timeout, 12)
            return "application/rss+xml", _rss(high_items if url.endswith("/high") else low_items)

        with (
            mock.patch.object(ai_news_tool, "FEED_REGISTRY", feeds),
            mock.patch("ai_news.ai_news_tool.http_tool.http_get", side_effect=fake_http_get),
        ):
            news = ai_news_tool.fetch_news()

        self.assertEqual(sum(1 for item in news if item["source"] in ("Priority Feed", "High")), 20)
        self.assertEqual(sum(1 for item in news if item["title"].lower().replace("-", " ") == "openai releases gpt 5"), 0)
        self.assertEqual(len([item for item in news if "releases" in item["title"].lower()]), 1)
        duplicate = [item for item in news if "releases" in item["title"].lower()][0]
        self.assertEqual(duplicate["source"], "Priority Feed")
        self.assertEqual(news[0]["title"], "Gemini product launch")
        self.assertGreaterEqual(news[0]["ts"], news[-1]["ts"])

    def test_fetch_news_parses_hn_json_branch(self):
        feeds = [
            {
                "name": "HN Algolia AI",
                "url": "https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story",
                "region": "global",
                "category": "mixed",
                "needs_ai_anchor": True,
            }
        ]
        payload = {
            "hits": [
                {"title": "Airport queue data", "url": "https://news.test/airport", "created_at_i": 123},
                {"title": "OpenAI arXiv paper benchmark", "url": "https://news.test/hn", "created_at_i": 456},
            ]
        }

        def fake_http_json(url, timeout=15):
            self.assertEqual(timeout, 12)
            return payload

        with (
            mock.patch.object(ai_news_tool, "FEED_REGISTRY", feeds),
            mock.patch("ai_news.ai_news_tool.http_tool.http_json", side_effect=fake_http_json),
            mock.patch("ai_news.ai_news_tool.http_tool.http_get", side_effect=AssertionError("RSS branch used")),
        ):
            news = ai_news_tool.fetch_news()

        self.assertEqual(news, [
            {
                "region": "global",
                "category": "연구",
                "title": "OpenAI arXiv paper benchmark",
                "source": "Hacker News",
                "link": "https://news.test/hn",
                "ts": 456,
            }
        ])

    def test_fetch_news_returns_empty_chunk_on_fetch_or_parse_failure(self):
        feeds = [
            {
                "name": "Broken Feed",
                "url": "https://feed.test/broken",
                "region": "global",
                "category": "mixed",
                "needs_ai_anchor": False,
            }
        ]
        with (
            mock.patch.object(ai_news_tool, "FEED_REGISTRY", feeds),
            mock.patch("ai_news.ai_news_tool.http_tool.http_get", side_effect=TimeoutError),
        ):
            self.assertEqual(ai_news_tool.fetch_news(), [])

    def test_fetch_hf_models_dedupes_splits_and_limits_results(self):
        calls = []

        def fake_http_json(url, timeout=15):
            calls.append((url, timeout))
            self.assertEqual(timeout, 12)
            if "sort=createdAt" in url and "text-to-video" in url:
                return [_model("shared", "2026-07-07T00:00:00Z")] + [
                    _model(f"latest-{i}", f"2026-07-{i + 1:02d}T00:00:00Z")
                    for i in range(14)
                ]
            if "sort=createdAt" in url:
                return [_model("shared", "2026-07-08T00:00:00Z"), _model("image-latest", "2026-08-01T00:00:00Z")]
            if "text-to-video" in url:
                return [_model("trend-shared", "2026-01-01T00:00:00Z")] + [
                    _model(f"trend-{i}", f"2026-01-{i + 1:02d}T00:00:00Z")
                    for i in range(14)
                ]
            return [_model("trend-shared", "2026-02-01T00:00:00Z"), _model("image-trend", "2026-02-02T00:00:00Z")]

        with mock.patch("ai_news.ai_news_tool.http_tool.http_json", side_effect=fake_http_json):
            models = ai_news_tool.fetch_hf_models()

        self.assertEqual(len(calls), 4)
        self.assertEqual([timeout for _, timeout in calls], [12, 12, 12, 12])
        self.assertEqual(len(models["latest"]), 12)
        self.assertEqual(len(models["trending"]), 12)
        self.assertEqual(models["latest"][0]["id"], "image-latest")
        self.assertEqual(len({m["id"] for m in models["latest"]}), 12)
        self.assertEqual(len({m["id"] for m in models["trending"]}), 12)
        self.assertEqual(models["latest"][0]["pipeline"], "image-to-video")
        self.assertIn("trend-shared", [m["id"] for m in models["trending"]])

    def test_fetch_hf_models_returns_empty_lists_on_fetch_failure(self):
        with mock.patch("ai_news.ai_news_tool.http_tool.http_json", side_effect=TimeoutError):
            self.assertEqual(ai_news_tool.fetch_hf_models(), {"latest": [], "trending": []})

    def test_get_ai_data_cache_contract_and_force_refresh(self):
        calls = []

        def fake_news():
            calls.append("news")
            return [{"title": str(len(calls))}]

        def fake_models():
            calls.append("models")
            return {"latest": [{"id": str(len(calls))}], "trending": []}

        with (
            mock.patch("ai_news.ai_news_tool.fetch_news", side_effect=fake_news),
            mock.patch("ai_news.ai_news_tool.fetch_hf_models", side_effect=fake_models),
        ):
            data, fetched_at = ai_news_tool.get_ai_data(False)
            data2, fetched_at2 = ai_news_tool.get_ai_data(False)
            data3, fetched_at3 = ai_news_tool.get_ai_data(True)

        self.assertEqual(data, data2)
        self.assertEqual(fetched_at, fetched_at2)
        self.assertNotEqual(data2, data3)
        self.assertNotEqual(fetched_at2, fetched_at3)
        self.assertEqual(calls.count("news"), 2)
        self.assertEqual(calls.count("models"), 2)
        self.assertIn(("ai",), cache_tool._cache)

    def test_fetch_oembed_routes_supported_hosts(self):
        captured = []

        def fake_http_json(url, timeout=15):
            captured.append((url, timeout))
            return {"title": "Title", "author_name": "Author", "thumbnail_url": "https://img.test/t.jpg"}

        with mock.patch("ai_news.ai_news_tool.http_tool.http_json", side_effect=fake_http_json):
            tiktok = ai_news_tool.fetch_oembed("https://www.tiktok.com/@x/video/1")
            youtube = ai_news_tool.fetch_oembed("https://youtu.be/abc")

        self.assertEqual(tiktok, {"ok": True, "title": "Title", "author": "Author", "thumbnail": "https://img.test/t.jpg"})
        self.assertEqual(youtube["ok"], True)
        self.assertEqual(captured[0], ("https://www.tiktok.com/oembed?url=https%3A%2F%2Fwww.tiktok.com%2F%40x%2Fvideo%2F1", 10))
        self.assertEqual(captured[1], ("https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fyoutu.be%2Fabc", 10))

    def test_fetch_oembed_unsupported_and_fetch_failed(self):
        self.assertEqual(
            ai_news_tool.fetch_oembed("https://example.com/x"),
            {"ok": False, "reason": "unsupported"},
        )
        with mock.patch("ai_news.ai_news_tool.http_tool.http_json", side_effect=TimeoutError):
            self.assertEqual(
                ai_news_tool.fetch_oembed("https://www.youtube.com/watch?v=abc"),
                {"ok": False, "reason": "fetch_failed"},
            )


if __name__ == "__main__":
    unittest.main()
