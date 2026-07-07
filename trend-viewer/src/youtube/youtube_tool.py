"""YouTube search helpers ported from the upstream stdlib server."""

import base64
import json
import re
import urllib.error
from concurrent.futures import ThreadPoolExecutor

from shared import cache_tool, http_tool


CATEGORIES = {
    "먹방": "먹방",
    "뷰티/패션": "뷰티 메이크업 패션",
    "브이로그": "브이로그",
    "예능/코미디": "예능 웃긴 영상",
    "영화/드라마": "영화 드라마 리뷰",
    "테크/IT": "테크 리뷰",
    "지식/교육": "지식 교양",
    "여행": "여행",
    "동물": "강아지 고양이",
}

COUNTRY_LOCALE = {"KR": ("ko", "KR"), "US": ("en", "US"), "JP": ("ja", "JP")}

COUNTRY_CATEGORIES = {
    "US": {
        "먹방": ["mukbang", "food challenge"],
        "뷰티/패션": ["makeup tutorial", "beauty vlog"],
        "브이로그": ["daily vlog", "week in my life"],
        "예능/코미디": ["funny videos", "comedy skits"],
        "영화/드라마": ["movie review", "Netflix review"],
        "테크/IT": ["tech review", "AI tools"],
        "지식/교육": ["explained", "educational documentary"],
        "여행": ["travel vlog", "best places to visit"],
        "동물": ["cute animals", "funny pets"],
    },
    "JP": {
        "먹방": ["モッパン", "大食い"],
        "뷰티/패션": ["メイク 美容", "ファッション 購入品"],
        "브이로그": ["日常 vlog", "一日密着"],
        "예능/코미디": ["お笑い コント", "バラエティ 面白い"],
        "영화/드라마": ["映画 レビュー", "ドラマ 考察"],
        "테크/IT": ["ガジェット レビュー", "AI ツール"],
        "지식/교육": ["解説 わかりやすい", "ゆっくり解説"],
        "여행": ["旅行 vlog", "ひとり旅"],
        "동물": ["動物 かわいい", "猫 犬 癒し"],
    },
}

ALL_MERGE = ["먹방", "브이로그", "예능/코미디", "뷰티/패션", "영화/드라마", "여행"]

PERIOD_CODE = {"day": 2, "week": 3, "month": 4}

PERIOD_EXCLUDE_BY_LOCALE = {
    "ko": {
        "day": ("일 전", "주 전", "개월 전", "년 전"),
        "week": ("주 전", "개월 전", "년 전"),
        "month": ("개월 전", "년 전"),
    },
    "en": {
        "day": (
            "day ago",
            "days ago",
            "week ago",
            "weeks ago",
            "month ago",
            "months ago",
            "year ago",
            "years ago",
        ),
        "week": (
            "week ago",
            "weeks ago",
            "month ago",
            "months ago",
            "year ago",
            "years ago",
        ),
        "month": ("month ago", "months ago", "year ago", "years ago"),
    },
    "ja": {
        "day": ("日前", "週間前", "か月前", "年前"),
        "week": ("週間前", "か月前", "年前"),
        "month": ("か月前", "年前"),
    },
}

AI_YT_QUERIES = ["AI 영상 제작", "AI 영상 생성", "sora ai video", "runway kling veo"]


def _country_key(country: str) -> str:
    country = (country or "KR").upper()
    return country if country in COUNTRY_LOCALE else "KR"


def _locale_for_country(country: str):
    return COUNTRY_LOCALE[_country_key(country)]


def _category_queries(category: str, country: str):
    if category == "전체":
        queries = []
        for name in ALL_MERGE:
            queries.extend(_category_queries(name, country))
        return queries
    if category == "AI":
        return AI_YT_QUERIES
    country_categories = COUNTRY_CATEGORIES.get(_country_key(country), {})
    return list(country_categories.get(category, [CATEGORIES.get(category, category)]))


def within_period(published: str, period: str, country: str = "KR") -> bool:
    if not published:
        return True
    hl, _ = _locale_for_country(country)
    haystack = published.casefold()
    excludes = PERIOD_EXCLUDE_BY_LOCALE.get(hl, PERIOD_EXCLUDE_BY_LOCALE["ko"])
    return not any(word.casefold() in haystack for word in excludes.get(period, ()))


def build_search_params(period: str, shorts: bool = False) -> str:
    filters = bytes([0x08, PERIOD_CODE.get(period, 3), 0x10, 0x01])
    if shorts:
        filters += bytes([0x18, 0x01])
    raw = bytes([0x08, 0x03, 0x12, len(filters)]) + filters
    return base64.urlsafe_b64encode(raw).decode()


def extract_videos(node, out):
    if isinstance(node, dict):
        if "videoRenderer" in node:
            v = node["videoRenderer"]
            title = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
            views_text = v.get("viewCountText", {}).get("simpleText", "")
            thumbs = v.get("thumbnail", {}).get("thumbnails", [])
            out.append(
                {
                    "id": v.get("videoId", ""),
                    "title": title,
                    "channel": "".join(
                        r.get("text", "") for r in v.get("ownerText", {}).get("runs", [])
                    ),
                    "views": http_tool.parse_view_count(views_text),
                    "viewsText": views_text,
                    "length": v.get("lengthText", {}).get("simpleText", ""),
                    "published": v.get("publishedTimeText", {}).get("simpleText", ""),
                    "thumbnail": thumbs[-1]["url"] if thumbs else "",
                }
            )
        for value in node.values():
            extract_videos(value, out)
    elif isinstance(node, list):
        for item in node:
            extract_videos(item, out)


def yt_search(query: str, period: str, shorts: bool, country: str = "KR"):
    hl, gl = _locale_for_country(country)
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20250624.01.00",
                "hl": hl,
                "gl": gl,
            }
        },
        "query": query,
        "params": build_search_params(period, shorts),
    }
    try:
        data = http_tool.http_json("https://www.youtube.com/youtubei/v1/search", payload)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return []
    videos = []
    extract_videos(data, videos)
    seen, unique = set(), []
    for v in videos:
        if v["id"] and v["id"] not in seen and within_period(v["published"], period, country):
            seen.add(v["id"])
            unique.append(v)
    return unique


def yt_like_count(video_id: str, country: str = "KR"):
    hl, gl = _locale_for_country(country)
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20250624.01.00",
                "hl": hl,
                "gl": gl,
            }
        },
        "videoId": video_id,
    }
    try:
        _, body = http_tool.http_get(
            "https://www.youtube.com/youtubei/v1/next", payload=payload, timeout=10
        )
        s = body.decode("utf-8", "ignore")
        m = re.search(r"다른 사용자 ([0-9,]+)명", s) or re.search(
            r"along with ([0-9,]+) other", s
        )
        return int(m.group(1).replace(",", "")) + 1 if m else 0
    except Exception:
        return 0


def enrich_likes(videos, limit=45, country: str = "KR"):
    todo = [v for v in videos[:limit] if not v.get("likes")]
    if not todo:
        return videos
    with ThreadPoolExecutor(max_workers=12) as pool:
        counts = pool.map(lambda v: yt_like_count(v["id"], country), todo)
    for v, c in zip(todo, counts):
        v["likes"] = c
    return videos


def merge_yt_searches(queries, period, shorts, country: str = "KR"):
    with ThreadPoolExecutor(max_workers=6) as pool:
        results = pool.map(lambda q: yt_search(q, period, shorts, country), queries)
    merged, seen = [], set()
    for chunk in results:
        for v in chunk:
            if v["id"] not in seen:
                seen.add(v["id"])
                merged.append(v)
    merged.sort(key=lambda v: v["views"], reverse=True)
    return merged


def get_videos(
    category: str,
    period: str,
    shorts: bool,
    force: bool,
    enrich: bool = False,
    query: str = "",
    country: str = "KR",
):
    country = _country_key(country)

    def fetch():
        if query:
            queries = [query]
        else:
            queries = _category_queries(category, country)
        vids = merge_yt_searches(queries, period, shorts, country)
        if enrich:
            enrich_likes(vids, country=country)
        return vids

    return cache_tool.cached(
        ("yt", country, query or category, period, shorts, enrich), force, fetch
    )
