"""AI news and model helpers ported from the upstream stdlib server."""

import email.utils
import json
import re
import time
import unicodedata
import urllib.error
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote, urlparse

from shared import cache_tool, http_tool


def _google_news_url(query, hl, gl, ceid):
    return "https://news.google.com/rss/search?q=%s&hl=%s&gl=%s&ceid=%s" % (
        quote(query),
        hl,
        gl,
        ceid,
    )


def _feed(name, url, region, category, needs_ai_anchor=False):
    return {
        "name": name,
        "url": url,
        "region": region,
        "category": category,
        "needs_ai_anchor": needs_ai_anchor,
    }


FEED_REGISTRY = [
    _feed("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/", "global", "산업·투자"),
    _feed("The Verge AI", "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", "global", "모델·제품"),
    _feed("VentureBeat AI", "https://venturebeat.com/category/ai/feed/", "global", "산업·투자"),
    _feed("Ars Technica AI", "https://arstechnica.com/ai/feed/", "global", "모델·제품"),
    _feed("MIT Tech Review AI", "https://www.technologyreview.com/topic/artificial-intelligence/feed/", "global", "연구"),
    _feed("arXiv cs.AI", "https://export.arxiv.org/rss/cs.AI", "global", "연구"),
    _feed("AI타임스", "https://www.aitimes.com/rss/allArticle.xml", "KR", "mixed", True),
    _feed("전자신문 AI", "https://rss.etnews.com/04046.xml", "KR", "mixed", True),
    _feed("전자신문 IT", "https://rss.etnews.com/03.xml", "KR", "mixed", True),
    _feed("ZDNet Korea", "https://feeds.feedburner.com/zdkorea", "KR", "mixed", True),
    _feed("한국경제 IT", "https://www.hankyung.com/feed/it", "KR", "mixed", True),
    _feed("Google News KR AI", _google_news_url("AI OR 인공지능", "ko", "KR", "KR:ko"), "KR", "mixed", True),
    _feed("Google News Global AI", _google_news_url("AI OR artificial intelligence", "en-US", "US", "US:en"), "global", "mixed", True),
    _feed("Google News KR 정책", _google_news_url("AI 정책 OR 규제", "ko", "KR", "KR:ko"), "KR", "정책·규제", True),
    _feed("HN Algolia AI", "https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story", "global", "mixed", True),
    _feed("Google News KR video generation", _google_news_url('AI 영상 생성 OR "AI 비디오" OR 영상생성모델', "ko", "KR", "KR:ko"), "KR", "모델·제품", True),
    _feed("Google News Global video generation", _google_news_url('"AI video" model OR Sora OR Runway OR Kling OR Veo', "en-US", "US", "US:en"), "global", "모델·제품", True),
]

HF_PIPELINES = ["text-to-video", "image-to-video"]

CATEGORIES = ("모델·제품", "연구", "산업·투자", "정책·규제")
CATEGORY_KEYWORDS = {
    # keyword -> weight. Named entities and unambiguous domain terms score 2
    # so a single strong hit clears the >=2 lead gate; generic words score 1.
    "모델·제품": {
        "llm": 2, "gpt": 2, "claude": 2, "gemini": 2, "llama": 2,
        "chatgpt": 2, "copilot": 2, "openai": 2, "anthropic": 2,
        "챗봇": 2, "생성형": 2, "출시": 2, "업데이트": 2,
        "agent": 1, "모델": 1, "api": 1,
    },
    "연구": {
        "arxiv": 2, "논문": 2, "paper": 2, "benchmark": 2, "sota": 2,
        "neurips": 2, "icml": 2, "iclr": 2, "cvpr": 2, "transformer": 2,
        "dataset": 2, "데이터셋": 2,
        "research": 1, "연구": 1,
    },
    "산업·투자": {
        "funding": 2, "투자유치": 2, "valuation": 2, "acquisition": 2,
        "m&a": 2, "ipo": 2, "startup": 2, "스타트업": 2,
        "투자": 1, "인수": 1, "partnership": 1, "협력": 1, "매출": 1,
        "revenue": 1, "반도체": 1, "chip": 1,
    },
    "정책·규제": {
        "regulation": 2, "규제": 2, "법안": 2, "수출통제": 2,
        "저작권": 2, "copyright": 2, "개인정보": 2, "privacy": 2,
        "policy": 1, "정책": 1, "law": 1, "compliance": 1,
        "safety": 1, "governance": 1, "안보": 1,
    },
}

AI_ANCHOR_WORDS = ["ai", "llm", "gpt", "chatgpt", "openai", "anthropic", "gemini"]
AI_ANCHOR_PHRASES = ["machine learning"]
AI_ANCHOR_KO = ["인공지능", "생성형", "머신러닝", "딥러닝"]


def _normalize_text(text):
    return unicodedata.normalize("NFKC", text or "").lower()


def _has_ascii_token(text, token):
    pattern = r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(token)
    return re.search(pattern, text) is not None


def _keyword_hit(text, keyword):
    keyword = _normalize_text(keyword)
    if " " in keyword:
        pattern = r"(?<![a-z0-9])%s(?![a-z0-9])" % re.escape(keyword).replace(r"\ ", r"\s+")
        return re.search(pattern, text) is not None
    if re.fullmatch(r"[a-z0-9]+", keyword):
        return _has_ascii_token(text, keyword)
    return keyword in text


def classify_news(title, source_default_category):
    text = _normalize_text(title)
    scores = {}
    for category, keywords in CATEGORY_KEYWORDS.items():
        score = 0
        for keyword, weight in keywords.items():
            if _keyword_hit(text, keyword):
                score += weight
        scores[category] = score

    ordered = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    leader, leader_score = ordered[0]
    runner_up_score = ordered[1][1]
    if leader_score > 0 and leader_score - runner_up_score >= 2:
        return leader
    if source_default_category in CATEGORIES:
        return source_default_category
    return "mixed"


def has_ai_anchor(title):
    text = _normalize_text(title)
    for phrase in AI_ANCHOR_PHRASES:
        if _keyword_hit(text, phrase):
            return True
    for word in AI_ANCHOR_WORDS:
        if _has_ascii_token(text, word):
            return True
    return any(keyword in text for keyword in AI_ANCHOR_KO)


def _news_ts(pub, fallback):
    try:
        return email.utils.parsedate_to_datetime(pub).timestamp()
    except (TypeError, ValueError):
        return fallback


def _news_item(feed, title, source, link, ts):
    return {
        "region": feed["region"],
        "category": classify_news(title, feed["category"]),
        "title": title,
        "source": source or feed["name"],
        "link": link,
        "ts": ts,
    }


def _parse_rss_news(feed, body, fetch_ts):
    root = ET.fromstring(body)
    items = []
    for item in root.iter("item"):
        title = item.findtext("title") or ""
        if feed["needs_ai_anchor"] and not has_ai_anchor(title):
            continue
        items.append(
            _news_item(
                feed,
                title,
                item.findtext("source") or "",
                item.findtext("link") or "",
                _news_ts(item.findtext("pubDate") or "", fetch_ts),
            )
        )
        if len(items) >= 20:
            break
    return items


def _parse_hn_news(feed, fetch_ts):
    data = http_tool.http_json(feed["url"], timeout=12)
    items = []
    for hit in data.get("hits", []):
        title = hit.get("title") or hit.get("story_title") or ""
        if feed["needs_ai_anchor"] and not has_ai_anchor(title):
            continue
        ts = hit.get("created_at_i") or fetch_ts
        items.append(
            _news_item(
                feed,
                title,
                "Hacker News",
                hit.get("url") or hit.get("story_url") or "",
                ts,
            )
        )
        if len(items) >= 20:
            break
    return items


def _dedupe_key(title):
    text = _normalize_text(title)
    return "".join(ch for ch in text if not ch.isspace() and not unicodedata.category(ch).startswith("P"))


def fetch_news():
    def one(feed):
        fetch_ts = time.time()
        try:
            if "hn.algolia.com/api/" in feed["url"]:
                return _parse_hn_news(feed, fetch_ts)
            _, body = http_tool.http_get(feed["url"], timeout=12)
            return _parse_rss_news(feed, body, fetch_ts)
        except Exception:
            return []

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = pool.map(one, FEED_REGISTRY)
    merged, seen = [], set()
    for chunk in results:
        for item in chunk:
            key = _dedupe_key(item["title"])
            if not key or key in seen:
                continue
            seen.add(key)
            merged.append(item)
    merged.sort(key=lambda n: n["ts"], reverse=True)
    return merged[:80]


def fetch_hf_models():
    def one(args):
        pipeline, sort = args
        url = (
            "https://huggingface.co/api/models?pipeline_tag=%s&sort=%s"
            "&direction=-1&limit=12" % (pipeline, sort)
        )
        try:
            data = http_tool.http_json(url, timeout=12)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
            return []
        return [
            {
                "id": m.get("id", ""),
                "likes": m.get("likes", 0),
                "downloads": m.get("downloads", 0),
                "pipeline": pipeline,
                "createdAt": m.get("createdAt", ""),
            }
            for m in data
        ]

    jobs = [(p, s) for p in HF_PIPELINES for s in ("createdAt", "trendingScore")]
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(one, jobs))

    def dedupe(lists):
        seen, out = set(), []
        for chunk in lists:
            for m in chunk:
                if m["id"] not in seen:
                    seen.add(m["id"])
                    out.append(m)
        return out

    latest = dedupe(results[0::2])
    latest.sort(key=lambda m: m["createdAt"], reverse=True)
    trending = dedupe(results[1::2])
    return {"latest": latest[:12], "trending": trending[:12]}


def get_ai_data(force: bool):
    def fetch():
        with ThreadPoolExecutor(max_workers=2) as pool:
            news_f = pool.submit(fetch_news)
            models_f = pool.submit(fetch_hf_models)
            return {"news": news_f.result(), "models": models_f.result()}

    return cache_tool.cached(("ai",), force, fetch)


def fetch_oembed(url: str):
    host = urlparse(url).netloc.lower()
    if "tiktok.com" in host:
        endpoint = "https://www.tiktok.com/oembed?url=" + quote(url, safe="")
    elif "youtube.com" in host or "youtu.be" in host:
        endpoint = "https://www.youtube.com/oembed?format=json&url=" + quote(url, safe="")
    else:
        return {"ok": False, "reason": "unsupported"}
    try:
        data = http_tool.http_json(endpoint, timeout=10)
        return {
            "ok": True,
            "title": data.get("title", ""),
            "author": data.get("author_name", ""),
            "thumbnail": data.get("thumbnail_url", ""),
        }
    except Exception:
        return {"ok": False, "reason": "fetch_failed"}
