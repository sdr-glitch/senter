"""Image proxy cache and allowlist handling."""

import threading
from urllib.parse import urlparse

from settings import IMG_CACHE_MAX, IMG_PROXY_ALLOW
from shared import http_tool


_img_cache = {}
_img_lock = threading.Lock()


def fetch_image(url):
    host = urlparse(url).netloc.lower()
    if not url.startswith("https://") or not host.endswith(IMG_PROXY_ALLOW):
        return 400, "application/json; charset=utf-8", {"error": "host not allowed"}

    hit = _img_cache.get(url)
    if hit:
        return 200, hit[0], hit[1]

    try:
        ctype, body = http_tool.http_get(url, timeout=12)
        ctype = ctype or "image/jpeg"
        with _img_lock:
            if len(_img_cache) > IMG_CACHE_MAX:
                _img_cache.clear()
            _img_cache[url] = (ctype, body)
        return 200, ctype, body
    except Exception:
        return 502, "application/json; charset=utf-8", {"error": "fetch failed"}
