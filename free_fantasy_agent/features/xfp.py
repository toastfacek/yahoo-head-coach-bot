from __future__ import annotations
import pandas as pd
import numpy as np

# Very simple expected fantasy points model (half-PPR-style)
# You should replace weights via backtesting on nflverse historical data.
WEIGHTS = {
    "target": 1.6,            # avg half-PPR pts per target baseline (non-RZ)
    "carry": 0.6,             # avg pts per carry baseline (non-RZ)
    "rz_target": 2.2,         # red zone targets (inside 20)
    "rz_carry": 1.0,          # red zone carries
    "gl_carry": 1.8,          # goal line carries (inside 5)
}

def compute_xfp_from_events(events: pd.DataFrame) -> pd.DataFrame:
    """
    events: player-week opportunity table with columns:
      season, week, player_id, targets, carries, rz_targets, rz_carries, gl_carries
    Returns: player-week xFP as weighted sum.
    """
    e = events.copy()
    e["xFP"] = (
        e.get("targets",0)    * WEIGHTS["target"] +
        e.get("carries",0)    * WEIGHTS["carry"] +
        e.get("rz_targets",0) * WEIGHTS["rz_target"] +
        e.get("rz_carries",0) * WEIGHTS["rz_carry"] +
        e.get("gl_carries",0) * WEIGHTS["gl_carry"]
    )
    return e[["season","week","player_id","xFP"]]
