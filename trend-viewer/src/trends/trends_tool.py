"""Google Trends RSS helpers for geo-scoped trending searches."""

import email.utils
import re
import time
import xml.etree.ElementTree as ET

from shared import cache_tool, http_tool


GEOS = ("KR", "US", "JP")
TRENDS_RSS_URL = "https://trends.google.com/trending/rss?geo=%s"
HT_NS = "https://trends.google.com/trending/rss"
NS = {"ht": HT_NS}
NEGATIVE_CACHE_TTL = 120


def _normalize_country(country: str) -> str:
    country = (country or "").upper()
    return country if country in GEOS else "KR"


def _traffic_value(text: str) -> int:
    digits = re.sub(r"[^\d]", "", text or "")
    return int(digits) if digits else 0


def _timestamp(pub_date: str, fallback: float) -> float:
    try:
        return email.utils.parsedate_to_datetime(pub_date).timestamp()
    except (TypeError, ValueError, AttributeError):
        return fallback


def _ht_text(node, tag: str) -> str:
    return node.findtext("ht:" + tag, default="", namespaces=NS) or ""


def _news_items(item) -> list:
    news = []
    for node in item.findall("ht:news_item", NS):
        news.append(
            {
                "title": _ht_text(node, "news_item_title"),
                "url": _ht_text(node, "news_item_url"),
                "source": _ht_text(node, "news_item_source"),
                "picture": _ht_text(node, "news_item_picture"),
            }
        )
        if len(news) == 3:
            break
    return news


def _parse_items(body, fallback_ts: float) -> list:
    root = ET.fromstring(body)
    items = []
    for item in root.iter("item"):
        traffic = _ht_text(item, "approx_traffic")
        items.append(
            {
                "keyword": item.findtext("title") or "",
                "traffic": traffic,
                "trafficValue": _traffic_value(traffic),
                "ts": _timestamp(item.findtext("pubDate"), fallback_ts),
                "picture": _ht_text(item, "picture"),
                "pictureSource": _ht_text(item, "picture_source"),
                "news": _news_items(item),
            }
        )
    items.sort(key=lambda trend: (trend["trafficValue"], trend["ts"]), reverse=True)
    return items


def fetch_trends(country: str) -> list:
    url = TRENDS_RSS_URL % country
    fetched_at = time.time()
    try:
        _, body = http_tool.http_get(url, timeout=12)
        return _parse_items(body, fetched_at), []
    except Exception as exc:
        return [], [{"country": country, "kind": exc.__class__.__name__}]


def get_trends(country: str = "KR", force: bool = False):
    country = _normalize_country(country)
    cache_key = ("trends", country)

    def fetch():
        return fetch_trends(country)

    def ttl_for_outcome(outcome):
        items, errors = outcome
        return NEGATIVE_CACHE_TTL if not items and errors else None

    (items, errors), fetched_at = cache_tool.cached(cache_key, force, fetch, ttl=ttl_for_outcome)
    return items, fetched_at, errors, cache_tool.ttl_for(cache_key)
