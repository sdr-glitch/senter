"""Small in-memory TTL cache shared by ported fetchers."""

import threading
import time

import settings


_cache = {}
_cache_lock = threading.Lock()


def _entry_ttl(hit):
    return hit[2] if len(hit) > 2 else settings.CACHE_TTL


def cached(key, force, fetch_fn, ttl=None):
    now = time.time()
    with _cache_lock:
        hit = _cache.get(key)
        if hit and not force and now - hit[0] < _entry_ttl(hit):
            return hit[1], hit[0]
    result = fetch_fn()
    effective_ttl = ttl(result) if callable(ttl) else ttl
    if effective_ttl is None:
        effective_ttl = settings.CACHE_TTL
    fetched_at = time.time()
    with _cache_lock:
        _cache[key] = (fetched_at, result, effective_ttl)
    return result, fetched_at


def ttl_for(key):
    with _cache_lock:
        hit = _cache.get(key)
        return _entry_ttl(hit) if hit else settings.CACHE_TTL
