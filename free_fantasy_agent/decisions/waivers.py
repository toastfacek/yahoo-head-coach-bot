from __future__ import annotations
import pandas as pd
import numpy as np

def upgrade_score(candidate: pd.Series, expendable: pd.Series) -> float:
    return float((candidate["mean_next3w"] - expendable["mean_next3w"]) - 0.5*candidate.get("volatility",0))

def fab_bid(private_value_pts: float, fab_remaining: float, weeks_left: int, starters_needing_upgrades: int,
            scarcity_mult: float=1.0, team_need_mult: float=1.0, timing_mult: float=1.0, league_aggr_mult: float=1.0,
            uncertainty_discount: float=0.0) -> float:
    per_point = fab_remaining / max(1, (weeks_left * (starters_needing_upgrades + 1)))
    bid = private_value_pts * per_point
    bid *= scarcity_mult * team_need_mult * timing_mult * league_aggr_mult
    bid *= (1.0 - uncertainty_discount)
    return max(0.0, bid)
