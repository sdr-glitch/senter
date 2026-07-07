"""Shared settings for the trend-viewer port."""

import os


PORT = int(os.environ.get("TREND_VIEWER_PORT", "8779"))
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "config"))
CACHE_TTL = int(os.environ.get("TREND_VIEWER_CACHE_TTL", "3600"))
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
IMG_CACHE_MAX = 600
IMG_PROXY_ALLOW = (".cdninstagram.com", ".fbcdn.net", ".ytimg.com",
                   ".googleusercontent.com", ".twimg.com",
                   ".tiktokcdn.com", ".tiktokcdn-eu.com", ".tiktokcdn-us.com",
                   ".gstatic.com")
