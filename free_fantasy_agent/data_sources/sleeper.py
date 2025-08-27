"""
Sleeper free read-only API.
Docs: https://docs.sleeper.com/
"""
from __future__ import annotations
import requests, pandas as pd

BASE = "https://api.sleeper.app/v1"

def load_players_nfl() -> pd.DataFrame:
    """Return DataFrame of Sleeper NFL players (id, name, team, pos, status, etc.)."""
    url = f"{BASE}/players/nfl"
    r = requests.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()
    # data is a dict keyed by player_id
    rows = []
    for pid, p in data.items():
        rows.append({
            "player_id": str(pid),
            "name": p.get("full_name") or p.get("first_name","") + " " + p.get("last_name",""),
            "team": p.get("team"),
            "pos": p.get("position"),
            "status": p.get("status"),
            "bye_week": p.get("bye_week"),
            "aliases": list(filter(None, {p.get("search_full_name"), p.get("first_name"), p.get("last_name"), p.get("full_name")}))
        })
    return pd.DataFrame(rows)
