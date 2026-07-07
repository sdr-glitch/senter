"""HTTP helpers ported from the upstream stdlib server."""

import json
import re
import urllib.request

from settings import UA


def http_get(url: str, payload=None, headers=None, timeout=15):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data)
    req.add_header("User-Agent", UA)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.headers.get("Content-Type", ""), resp.read()


def http_json(url: str, payload=None, headers=None, timeout=15):
    _, body = http_get(url, payload, headers, timeout)
    return json.loads(body.decode())


def parse_view_count(text: str) -> int:
    text = text or ""
    suffix_multipliers = {
        "K": 1_000,
        "M": 1_000_000,
        "B": 1_000_000_000,
        "만": 10_000,
        "万": 10_000,
        "억": 100_000_000,
        "億": 100_000_000,
    }
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*([KMB만万억億])", text, re.IGNORECASE)
    if m:
        raw = m.group(1)
        if re.fullmatch(r"\d+,\d{1,2}", raw):
            # decimal-comma abbreviation ("1,5K" -> 1.5K), not a thousands group
            value = float(raw.replace(",", "."))
        else:
            value = float(raw.replace(",", ""))
        suffix = m.group(2)
        multiplier = suffix_multipliers.get(
            suffix.upper(), suffix_multipliers.get(suffix)
        )
        return int(value * multiplier)
    digits = re.sub(r"[^\d]", "", text)
    return int(digits) if digits else 0
