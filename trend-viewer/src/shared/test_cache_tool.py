import unittest
from unittest import mock

from shared import cache_tool


class CacheToolTest(unittest.TestCase):
    def setUp(self):
        cache_tool._cache.clear()

    def tearDown(self):
        cache_tool._cache.clear()

    def test_cached_hit(self):
        calls = []
        with mock.patch("time.time", side_effect=[100.0, 101.0, 102.0]):
            result, fetched_at = cache_tool.cached("k", False, lambda: calls.append(1) or "v1")
            result2, fetched_at2 = cache_tool.cached("k", False, lambda: calls.append(2) or "v2")

        self.assertEqual(result, "v1")
        self.assertEqual(result2, "v1")
        self.assertEqual(fetched_at, 101.0)
        self.assertEqual(fetched_at2, 101.0)
        self.assertEqual(calls, [1])

    def test_cached_hit_preserves_seeded_fetched_at(self):
        cache_tool._cache["k"] = (123.0, "old")
        with mock.patch("shared.cache_tool.settings.CACHE_TTL", 10), mock.patch("time.time", return_value=125.0):
            result, fetched_at = cache_tool.cached("k", False, lambda: self.fail("cache hit should not fetch"))

        self.assertEqual(result, "old")
        self.assertEqual(fetched_at, 123.0)

    def test_cached_ttl_expiry(self):
        calls = []
        cache_tool._cache["k"] = (10.0, "old")
        with mock.patch("shared.cache_tool.settings.CACHE_TTL", 5), mock.patch(
            "time.time", side_effect=[20.0, 21.0]
        ):
            result, fetched_at = cache_tool.cached("k", False, lambda: calls.append(1) or "new")

        self.assertEqual(result, "new")
        self.assertEqual(fetched_at, 21.0)
        self.assertEqual(calls, [1])

    def test_cached_per_entry_ttl(self):
        calls = []
        cache_tool._cache["k"] = (10.0, "old", 120)
        with mock.patch("shared.cache_tool.settings.CACHE_TTL", 3600), mock.patch(
            "time.time", side_effect=[200.0, 201.0]
        ):
            result, fetched_at = cache_tool.cached("k", False, lambda: calls.append(1) or "new")

        self.assertEqual(result, "new")
        self.assertEqual(fetched_at, 201.0)
        self.assertEqual(calls, [1])

    def test_cached_ttl_selector_stores_effective_ttl(self):
        with mock.patch("time.time", side_effect=[100.0, 101.0]):
            result, fetched_at = cache_tool.cached(
                "k",
                False,
                lambda: ([], [{"account": "x"}]),
                ttl=lambda outcome: 120 if not outcome[0] and outcome[1] else None,
            )

        self.assertEqual(result, ([], [{"account": "x"}]))
        self.assertEqual(fetched_at, 101.0)
        self.assertEqual(cache_tool.ttl_for("k"), 120)

    def test_cached_force(self):
        cache_tool._cache["k"] = (10.0, "old")
        with mock.patch("time.time", side_effect=[11.0, 12.0]):
            result, fetched_at = cache_tool.cached("k", True, lambda: "forced")

        self.assertEqual(result, "forced")
        self.assertEqual(fetched_at, 12.0)


if __name__ == "__main__":
    unittest.main()
