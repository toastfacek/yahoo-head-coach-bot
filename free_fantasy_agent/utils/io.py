from __future__ import annotations
import os, json, hashlib, time, datetime as dt
from typing import Any, Dict

def cache_key(url: str) -> str:
    return hashlib.md5(url.encode()).hexdigest()

def ensure_dir(p: str) -> None:
    os.makedirs(p, exist_ok=True)
