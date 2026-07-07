import unittest
from unittest import mock
from xml.sax.saxutils import escape

from shared import cache_tool
from trends import trends_tool


def _tag(name, value):
    return f"<{name}>{escape(str(value))}</{name}>"


def _news(index):
    return (
        "<ht:news_item>"
        + _tag("ht:news_item_title", f"News {index}")
        + _tag("ht:news_item_url", f"https://news.test/{index}")
        + _tag("ht:news_item_source", f"Source {index}")
        + _tag("ht:news_item_picture", f"https://img.test/news-{index}.jpg")
        + "</ht:news_item>"
    )


def _item(title, traffic, pub_date, news_count=0):
    return (
        "<item>"
        + _tag("title", title)
        + _tag("pubDate", pub_date)
        + _tag("ht:approx_traffic", traffic)
        + _tag("ht:picture", f"https://img.test/{title}.jpg")
        + _tag("ht:picture_source", "Image Source")
        + "".join(_news(i) for i in range(news_count))
        + "</item>"
    )


def _rss(items):
    return (
        '<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>'
        + "".join(items)
        + "</channel></rss>"
    ).encode()


class TrendsToolTest(unittest.TestCase):
    def setUp(self):
        cache_tool._cache.clear()

    def tearDown(self):
        cache_tool._cache.clear()

    def test_get_trends_parses_items_sorts_and_caps_news(self):
        body = _rss(
            [
                _item("lower", "5,000+", "Tue, 07 Jul 2026 01:00:00 +0000", 1),
                _item("top keyword", "20,000+", "Tue, 07 Jul 2026 00:00:00 +0000", 4),
            ]
        )

        with mock.patch("trends.trends_tool.http_tool.http_get", return_value=("application/rss+xml", body)):
            items, fetched_at, errors, cache_ttl = trends_tool.get_trends("KR")

        self.assertGreater(fetched_at, 0)
        self.assertEqual(errors, [])
        self.assertGreater(cache_ttl, trends_tool.NEGATIVE_CACHE_TTL)
        self.assertEqual([item["keyword"] for item in items], ["top keyword", "lower"])
        self.assertEqual(items[0]["traffic"], "20,000+")
        self.assertEqual(items[0]["trafficValue"], 20000)
        self.assertEqual(items[0]["picture"], "https://img.test/top keyword.jpg")
        self.assertEqual(items[0]["pictureSource"], "Image Source")
        self.assertEqual(len(items[0]["news"]), 3)
        self.assertEqual(
            items[0]["news"][0],
            {
                "title": "News 0",
                "url": "https://news.test/0",
                "source": "Source 0",
                "picture": "https://img.test/news-0.jpg",
            },
        )
        self.assertGreater(items[0]["ts"], 0)

    def test_malformed_pub_date_falls_back_to_fetch_time(self):
        body = _rss([_item("bad date", "1,000+", "not a date")])

        with (
            mock.patch("trends.trends_tool.time.time", return_value=1777777777.0),
            mock.patch("trends.trends_tool.http_tool.http_get", return_value=("application/rss+xml", body)),
        ):
            items, _, _, _ = trends_tool.get_trends("KR", force=True)

        self.assertEqual(items[0]["ts"], 1777777777.0)

    def test_unknown_country_falls_back_to_kr(self):
        calls = []

        def fake_http_get(url, timeout=15):
            calls.append((url, timeout))
            return "application/rss+xml", _rss([_item("kr keyword", "100+", "Tue, 07 Jul 2026 00:00:00 +0000")])

        with mock.patch("trends.trends_tool.http_tool.http_get", side_effect=fake_http_get):
            items, _, _, _ = trends_tool.get_trends("ca")

        self.assertEqual(items[0]["keyword"], "kr keyword")
        self.assertEqual(calls, [("https://trends.google.com/trending/rss?geo=KR", 12)])
        self.assertIn(("trends", "KR"), cache_tool._cache)

    def test_cache_key_is_separate_per_country(self):
        calls = []

        def fake_http_get(url, timeout=15):
            calls.append(url)
            country = url.rsplit("=", 1)[-1]
            return "application/rss+xml", _rss([_item(country, "100+", "Tue, 07 Jul 2026 00:00:00 +0000")])

        with mock.patch("trends.trends_tool.http_tool.http_get", side_effect=fake_http_get):
            kr_items, kr_fetched_at, _, _ = trends_tool.get_trends("KR")
            us_items, _, _, _ = trends_tool.get_trends("US")
            kr_items_2, kr_fetched_at_2, _, _ = trends_tool.get_trends("KR")

        self.assertEqual([item["keyword"] for item in kr_items], ["KR"])
        self.assertEqual([item["keyword"] for item in us_items], ["US"])
        self.assertEqual(kr_items_2, kr_items)
        self.assertEqual(kr_fetched_at_2, kr_fetched_at)
        self.assertEqual(calls, ["https://trends.google.com/trending/rss?geo=KR", "https://trends.google.com/trending/rss?geo=US"])
        self.assertIn(("trends", "KR"), cache_tool._cache)
        self.assertIn(("trends", "US"), cache_tool._cache)

    def test_xml_error_returns_empty_list(self):
        with mock.patch("trends.trends_tool.http_tool.http_get", return_value=("application/rss+xml", b"<rss>")):
            items, fetched_at, errors, cache_ttl = trends_tool.get_trends("JP", force=True)

        self.assertEqual(items, [])
        self.assertGreater(fetched_at, 0)
        self.assertEqual(errors, [{"country": "JP", "kind": "ParseError"}])
        self.assertEqual(cache_ttl, trends_tool.NEGATIVE_CACHE_TTL)

    def test_fetch_failure_uses_negative_cache_ttl_then_recovers(self):
        body = _rss([_item("recovered", "100+", "Tue, 07 Jul 2026 00:00:00 +0000")])
        responses = [OSError("boom"), ("application/rss+xml", body)]

        def fake_http_get(url, timeout=15):
            result = responses.pop(0)
            if isinstance(result, Exception):
                raise result
            return result

        with mock.patch("trends.trends_tool.http_tool.http_get", side_effect=fake_http_get):
            items, _, errors, cache_ttl = trends_tool.get_trends("KR", force=True)
            self.assertEqual(items, [])
            self.assertEqual(errors[0]["kind"], "OSError")
            self.assertEqual(cache_ttl, trends_tool.NEGATIVE_CACHE_TTL)

            items, _, errors, cache_ttl = trends_tool.get_trends("KR", force=True)
            self.assertEqual([item["keyword"] for item in items], ["recovered"])
            self.assertEqual(errors, [])
            self.assertGreater(cache_ttl, trends_tool.NEGATIVE_CACHE_TTL)


if __name__ == "__main__":
    unittest.main()
