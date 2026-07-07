import unittest
from unittest import mock

from shared import cache_tool
from youtube import youtube_tool


def _video(video_id, title, views, published="1시간 전", thumb="https://img.test/2.jpg"):
    return {
        "videoRenderer": {
            "videoId": video_id,
            "title": {"runs": [{"text": title}]},
            "ownerText": {"runs": [{"text": "채널"}]},
            "viewCountText": {"simpleText": views},
            "lengthText": {"simpleText": "1:23"},
            "publishedTimeText": {"simpleText": published},
            "thumbnail": {"thumbnails": [{"url": "https://img.test/1.jpg"}, {"url": thumb}]},
        }
    }


class YoutubeToolTest(unittest.TestCase):
    def setUp(self):
        cache_tool._cache.clear()

    def tearDown(self):
        cache_tool._cache.clear()

    def test_extract_videos_nested_tree(self):
        data = {
            "contents": [
                {"section": {"items": [_video("a", "첫 영상", "조회수 12,345회")]}},
                _video("b", "Second Video", "1,000 views", "2시간 전"),
            ]
        }
        out = []

        youtube_tool.extract_videos(data, out)

        self.assertEqual(len(out), 2)
        self.assertEqual(out[0]["id"], "a")
        self.assertEqual(out[0]["title"], "첫 영상")
        self.assertEqual(out[0]["channel"], "채널")
        self.assertEqual(out[0]["views"], 12345)
        self.assertEqual(out[0]["viewsText"], "조회수 12,345회")
        self.assertEqual(out[0]["length"], "1:23")
        self.assertEqual(out[0]["published"], "1시간 전")
        self.assertEqual(out[0]["thumbnail"], "https://img.test/2.jpg")
        self.assertEqual(out[1]["views"], 1000)

    def test_within_period_filters_excluded_phrases(self):
        self.assertTrue(youtube_tool.within_period("", "day"))
        self.assertTrue(youtube_tool.within_period("3시간 전", "day"))
        self.assertFalse(youtube_tool.within_period("1일 전", "day"))
        self.assertTrue(youtube_tool.within_period("3일 전", "week"))
        self.assertFalse(youtube_tool.within_period("2주 전", "week"))
        self.assertTrue(youtube_tool.within_period("2주 전", "month"))
        self.assertFalse(youtube_tool.within_period("1개월 전", "month"))

    def test_within_period_filters_english_and_japanese_phrases(self):
        self.assertFalse(youtube_tool.within_period("1 day ago", "day", "US"))
        self.assertFalse(youtube_tool.within_period("3 days ago", "day", "US"))
        self.assertFalse(youtube_tool.within_period("2 weeks ago", "day", "US"))
        self.assertTrue(youtube_tool.within_period("13 days ago", "week", "US"))
        self.assertFalse(youtube_tool.within_period("2 weeks ago", "week", "US"))
        self.assertFalse(youtube_tool.within_period("1 month ago", "month", "US"))
        self.assertTrue(youtube_tool.within_period("2 日前", "week", "JP"))
        self.assertFalse(youtube_tool.within_period("2 週間前", "week", "JP"))
        self.assertFalse(youtube_tool.within_period("3 か月前", "month", "JP"))

    def test_build_search_params_exact_base64(self):
        expected = {
            ("day", False): "CAMSBAgCEAE=",
            ("day", True): "CAMSBggCEAEYAQ==",
            ("week", False): "CAMSBAgDEAE=",
            ("week", True): "CAMSBggDEAEYAQ==",
            ("month", False): "CAMSBAgEEAE=",
            ("month", True): "CAMSBggEEAEYAQ==",
        }
        for (period, shorts), value in expected.items():
            with self.subTest(period=period, shorts=shorts):
                self.assertEqual(youtube_tool.build_search_params(period, shorts), value)

    def test_yt_search_payload_dedupes_filters_period_and_uses_country_locale(self):
        captured = {}

        def fake_http_json(url, payload=None, timeout=15):
            captured["url"] = url
            captured["payload"] = payload
            captured["timeout"] = timeout
            return {
                "items": [
                    _video("new", "New", "2,000 views", "1 hour ago"),
                    _video("new", "Duplicate", "9,999 views", "2 hours ago"),
                    _video("old", "Old", "5,000 views", "3 days ago"),
                ]
            }

        with mock.patch("youtube.youtube_tool.http_tool.http_json", side_effect=fake_http_json):
            videos = youtube_tool.yt_search("테스트", "day", True, country="US")

        payload = captured["payload"]
        self.assertEqual(captured["url"], "https://www.youtube.com/youtubei/v1/search")
        self.assertEqual(captured["timeout"], 15)
        self.assertEqual(payload["context"]["client"]["clientName"], "WEB")
        self.assertEqual(payload["context"]["client"]["clientVersion"], "2.20250624.01.00")
        self.assertEqual(payload["context"]["client"]["hl"], "en")
        self.assertEqual(payload["context"]["client"]["gl"], "US")
        self.assertEqual(payload["query"], "테스트")
        self.assertEqual(payload["params"], "CAMSBggCEAEYAQ==")
        self.assertEqual([v["id"] for v in videos], ["new"])

    def test_yt_search_unknown_country_falls_back_to_korean_locale(self):
        captured = {}

        def fake_http_json(url, payload=None, timeout=15):
            del url, timeout
            captured["payload"] = payload
            return {}

        with mock.patch("youtube.youtube_tool.http_tool.http_json", side_effect=fake_http_json):
            self.assertEqual(youtube_tool.yt_search("테스트", "week", False, country="DE"), [])

        payload = captured["payload"]
        self.assertEqual(payload["context"]["client"]["hl"], "ko")
        self.assertEqual(payload["context"]["client"]["gl"], "KR")

    def test_yt_like_count_regex_korean_english_and_failure(self):
        bodies = [
            b'..."like this video along with 1,234 other"...',
            "다른 사용자 5,678명".encode(),
            b"no like count",
        ]
        payloads = []

        def fake_http_get(url, payload=None, timeout=15):
            del url
            payloads.append((payload, timeout))
            return "application/json", bodies.pop(0)

        with mock.patch("youtube.youtube_tool.http_tool.http_get", side_effect=fake_http_get):
            self.assertEqual(youtube_tool.yt_like_count("a", country="US"), 1235)
            self.assertEqual(youtube_tool.yt_like_count("b", country="JP"), 5679)
            self.assertEqual(youtube_tool.yt_like_count("c"), 0)
        self.assertEqual(payloads[0][0]["context"]["client"]["hl"], "en")
        self.assertEqual(payloads[0][0]["context"]["client"]["gl"], "US")
        self.assertEqual(payloads[1][0]["context"]["client"]["hl"], "ja")
        self.assertEqual(payloads[1][0]["context"]["client"]["gl"], "JP")
        self.assertEqual(payloads[2][0]["context"]["client"]["hl"], "ko")
        self.assertEqual(payloads[2][0]["context"]["client"]["gl"], "KR")
        self.assertEqual([timeout for _, timeout in payloads], [10, 10, 10])

    def test_get_videos_query_selection_and_force_cache_contract(self):
        calls = []

        def fake_merge(queries, period, shorts, country="KR"):
            calls.append((list(queries), period, shorts, country))
            return [{"id": str(len(calls)), "views": len(calls)}]

        with mock.patch("youtube.youtube_tool.merge_yt_searches", side_effect=fake_merge):
            videos, fetched_at = youtube_tool.get_videos("전체", "week", False, False)
            videos2, fetched_at2 = youtube_tool.get_videos("전체", "week", False, False)
            videos3, fetched_at3 = youtube_tool.get_videos("전체", "week", False, True)
            ai_videos, _ = youtube_tool.get_videos("AI", "day", True, True)
            query_videos, _ = youtube_tool.get_videos("먹방", "month", False, True, query="custom")

        self.assertEqual(
            calls[0],
            ([youtube_tool.CATEGORIES[c] for c in youtube_tool.ALL_MERGE], "week", False, "KR"),
        )
        self.assertEqual(videos, videos2)
        self.assertEqual(fetched_at, fetched_at2)
        self.assertNotEqual(videos2, videos3)
        self.assertNotEqual(fetched_at2, fetched_at3)
        self.assertEqual(calls[2], (youtube_tool.AI_YT_QUERIES, "day", True, "KR"))
        self.assertEqual(calls[3], (["custom"], "month", False, "KR"))
        self.assertEqual(ai_videos[0]["id"], "3")
        self.assertEqual(query_videos[0]["id"], "4")
        self.assertEqual(len(calls), 4)

    def test_get_videos_cache_key_includes_country_and_country_categories_fallback(self):
        calls = []

        def fake_merge(queries, period, shorts, country="KR"):
            calls.append((list(queries), period, shorts, country))
            return [{"id": f"{country}-{len(calls)}", "views": len(calls)}]

        with mock.patch("youtube.youtube_tool.merge_yt_searches", side_effect=fake_merge):
            kr_videos, kr_time = youtube_tool.get_videos("먹방", "week", False, False)
            us_videos, us_time = youtube_tool.get_videos("먹방", "week", False, False, country="US")
            jp_videos, _ = youtube_tool.get_videos("먹방", "week", False, True, country="JP")
            fallback_videos, _ = youtube_tool.get_videos(
                "먹방", "week", False, True, country="DE"
            )

        self.assertEqual(calls[0], (["먹방"], "week", False, "KR"))
        self.assertEqual(calls[1], (["mukbang", "food challenge"], "week", False, "US"))
        self.assertEqual(calls[2], (["モッパン", "大食い"], "week", False, "JP"))
        self.assertEqual(calls[3], (["먹방"], "week", False, "KR"))
        self.assertNotEqual(kr_videos, us_videos)
        self.assertNotEqual(kr_time, us_time)
        self.assertEqual(jp_videos[0]["id"], "JP-3")
        self.assertEqual(fallback_videos[0]["id"], "KR-4")

    def test_get_videos_country_whole_category_uses_same_merge_names(self):
        calls = []

        def fake_merge(queries, period, shorts, country="KR"):
            calls.append((list(queries), period, shorts, country))
            return []

        with mock.patch("youtube.youtube_tool.merge_yt_searches", side_effect=fake_merge):
            youtube_tool.get_videos("전체", "day", True, True, country="US")

        expected = []
        for name in youtube_tool.ALL_MERGE:
            expected.extend(youtube_tool.COUNTRY_CATEGORIES["US"][name])
        self.assertEqual(calls[0], (expected, "day", True, "US"))


if __name__ == "__main__":
    unittest.main()
