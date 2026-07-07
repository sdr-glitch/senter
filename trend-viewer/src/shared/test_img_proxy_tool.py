import unittest
from unittest import mock

from settings import IMG_CACHE_MAX
from shared import img_proxy_tool


class ImgProxyToolTest(unittest.TestCase):
    def setUp(self):
        img_proxy_tool._img_cache.clear()

    def tearDown(self):
        img_proxy_tool._img_cache.clear()

    def test_allowlist_rejects_http_and_disallowed_host(self):
        self.assertEqual(
            img_proxy_tool.fetch_image("http://evil.example/x.jpg"),
            (400, "application/json; charset=utf-8", {"error": "host not allowed"}),
        )
        self.assertEqual(
            img_proxy_tool.fetch_image("https://evil.example/x.jpg"),
            (400, "application/json; charset=utf-8", {"error": "host not allowed"}),
        )

    def test_cache_hit_skips_fetch(self):
        url = "https://thumb.cdninstagram.com/x.jpg"
        img_proxy_tool._img_cache[url] = ("image/jpeg", b"cached")
        with mock.patch("shared.http_tool.http_get") as http_get:
            self.assertEqual(img_proxy_tool.fetch_image(url), (200, "image/jpeg", b"cached"))
        http_get.assert_not_called()

    def test_cache_clear_at_max(self):
        url = "https://thumb.cdninstagram.com/new.jpg"
        for i in range(IMG_CACHE_MAX + 1):
            img_proxy_tool._img_cache[f"https://thumb.cdninstagram.com/{i}.jpg"] = (
                "image/jpeg",
                b"x",
            )

        with mock.patch("shared.http_tool.http_get", return_value=("image/png", b"fresh")):
            self.assertEqual(img_proxy_tool.fetch_image(url), (200, "image/png", b"fresh"))

        self.assertEqual(list(img_proxy_tool._img_cache), [url])


if __name__ == "__main__":
    unittest.main()
