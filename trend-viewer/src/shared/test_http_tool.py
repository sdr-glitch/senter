import json
import unittest
from unittest import mock

import settings
from shared import http_tool


class _Response:
    def __init__(self, content_type="application/json", body=b"{}"):
        self.headers = {"Content-Type": content_type}
        self._body = body

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self):
        return self._body


class HttpToolTest(unittest.TestCase):
    def test_parse_view_count_digits_empty_and_full_counts(self):
        self.assertEqual(http_tool.parse_view_count("조회수 12,345회"), 12345)
        self.assertEqual(http_tool.parse_view_count("조회수 1,234,567회"), 1234567)
        self.assertEqual(http_tool.parse_view_count("1,234,567 views"), 1234567)
        self.assertEqual(http_tool.parse_view_count("1,234回視聴"), 1234)
        self.assertEqual(http_tool.parse_view_count("1234 views"), 1234)
        self.assertEqual(http_tool.parse_view_count(""), 0)
        self.assertEqual(http_tool.parse_view_count(None), 0)

    def test_parse_view_count_abbreviated_suffixes(self):
        cases = {
            "조회수 6.6만회": 66000,
            "170억회": 17000000000,
            "492K views": 492000,
            "4.5B views": 4500000000,
            "466万回視聴": 4660000,
            "2.5億回視聴": 250000000,
            "1.5만": 15000,
            "1,5K views": 1500,
            "1,500K views": 1500000,
        }
        for text, expected in cases.items():
            with self.subTest(text=text):
                self.assertEqual(http_tool.parse_view_count(text), expected)

    def test_http_get_header_and_payload_construction(self):
        captured = {}

        def fake_urlopen(req, timeout):
            captured["req"] = req
            captured["timeout"] = timeout
            return _Response("application/json", b'{"ok": true}')

        payload = {"hello": "world"}
        with mock.patch("urllib.request.urlopen", side_effect=fake_urlopen):
            content_type, body = http_tool.http_get(
                "https://example.test/api",
                payload=payload,
                headers={"X-Test": "1"},
                timeout=7,
            )

        req = captured["req"]
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(req.full_url, "https://example.test/api")
        self.assertEqual(req.data, json.dumps(payload).encode())
        self.assertEqual(req.headers["User-agent"], settings.UA)
        self.assertEqual(req.headers["Content-type"], "application/json")
        self.assertEqual(req.headers["X-test"], "1")
        self.assertEqual(content_type, "application/json")
        self.assertEqual(body, b'{"ok": true}')


if __name__ == "__main__":
    unittest.main()
