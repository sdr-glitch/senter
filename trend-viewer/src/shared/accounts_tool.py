"""Account list storage and source registry."""

import json
import os

import settings


_sources = {}


def load_accounts(path, defaults):
    try:
        with open(path) as f:
            accounts = json.load(f)
            if isinstance(accounts, list) and accounts:
                return accounts
    except (OSError, json.JSONDecodeError):
        pass
    return list(defaults)


def save_accounts(path, accounts):
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    with open(path, "w") as f:
        json.dump(accounts, f, ensure_ascii=False, indent=2)


def register_source(name, filename, defaults, preserve_case=False):
    path = os.path.join(settings.CONFIG_DIR, filename)
    _sources[name] = {
        "path": path,
        "defaults": list(defaults),
        "preserve_case": preserve_case,
    }


def get_source(name):
    return _sources.get(name)


def update_accounts(name, action, username):
    source = _sources[name]
    raw = (username or "").strip().lstrip("@")
    normalized = raw if source["preserve_case"] else raw.lower()
    accounts = load_accounts(source["path"], source["defaults"])
    if action == "add" and normalized and normalized not in accounts:
        accounts.append(normalized)
    elif action == "remove" and normalized in accounts:
        accounts.remove(normalized)
    save_accounts(source["path"], accounts)
    return accounts
