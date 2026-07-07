"""Saved/bookmarked trend items persistence."""

import json
import os
import time
import uuid

import settings

SAVED_FILE = os.path.join(settings.CONFIG_DIR, "saved_items.json")


def _load():
    try:
        with open(SAVED_FILE) as f:
            items = json.load(f)
            if isinstance(items, list):
                return items
    except (OSError, json.JSONDecodeError):
        pass
    return []


def _save(items):
    os.makedirs(os.path.dirname(SAVED_FILE), exist_ok=True)
    with open(SAVED_FILE, "w") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


def list_items():
    return _load()


def add_item(source, title, url, thumbnail="", note="", tags=None):
    items = _load()
    if any(it.get("url") == url for it in items):
        return items, False
    item = {
        "id": uuid.uuid4().hex[:12],
        "source": source,
        "title": title,
        "url": url,
        "thumbnail": thumbnail,
        "note": note,
        "tags": tags or [],
        "savedAt": time.time(),
    }
    items.insert(0, item)
    _save(items)
    return items, True


def remove_item(item_id):
    items = _load()
    before = len(items)
    items = [it for it in items if it.get("id") != item_id]
    if len(items) < before:
        _save(items)
        return items, True
    return items, False
