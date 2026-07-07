"""TikTok helpers ported from the upstream stdlib server."""

import json
import urllib.error
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

from shared import accounts_tool, cache_tool, http_tool


DEFAULT_TIKTOK_ACCOUNTS = [
    "openai",
    "runwayapp",
    "krea.ai",
    "elevenlabs",
    "sora",
    "zachking",
    "khaby.lame",
    "google",
]
TIKWM_BASE = "https://www.tikwm.com/api"
TIKTOK_REGION = "KR"


def register():
    accounts_tool.register_source("tiktok", "tiktok_accounts.json", DEFAULT_TIKTOK_ACCOUNTS)


def _tiktok_item(v):
    author = v.get("author", {}) if isinstance(v.get("author"), dict) else {}
    handle = author.get("unique_id", "")
    if not isinstance(handle, str):
        handle = ""
    nickname = author.get("nickname", handle)
    if not isinstance(nickname, str):
        nickname = handle
    vid = v.get("video_id", "")
    return {
        "account": handle,
        "name": nickname,
        "title": (v.get("title") or "").strip() or "(설명 없음)",
        "views": v.get("play_count") or 0,
        "likes": v.get("digg_count") or 0,
        "comments": v.get("comment_count") or 0,
        "shares": v.get("share_count") or 0,
        "thumbnail": v.get("cover") or v.get("origin_cover") or "",
        "url": "https://www.tiktok.com/@%s/video/%s" % (handle, vid),
        "id": vid,
        "createdAt": v.get("create_time") or 0,
    }


def fetch_tiktok_user(handle: str):
    url = "%s/user/posts?unique_id=%s&count=12" % (TIKWM_BASE, quote(handle))
    try:
        d = http_tool.http_json(url, timeout=15)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []
    vids = (d.get("data") or {}).get("videos") or []
    return [_tiktok_item(v) for v in vids]


def fetch_tiktok_trending():
    url = "%s/feed/list?region=%s&count=20" % (TIKWM_BASE, TIKTOK_REGION)
    try:
        d = http_tool.http_json(url, timeout=15)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return []
    vids = d.get("data") or []
    return [_tiktok_item(v) for v in vids]


def get_tiktok(force: bool):
    source = accounts_tool.get_source("tiktok")
    accounts = accounts_tool.load_accounts(source["path"], source["defaults"])

    def fetch():
        posts = fetch_tiktok_trending()
        with ThreadPoolExecutor(max_workers=3) as pool:
            for chunk in pool.map(fetch_tiktok_user, accounts):
                posts.extend(chunk)
        seen, unique = set(), []
        for p in posts:
            if p["id"] and p["id"] not in seen:
                seen.add(p["id"])
                unique.append(p)
        return unique

    posts, fetched_at = cache_tool.cached(("tiktok", tuple(accounts)), force, fetch)
    return posts, accounts, fetched_at
