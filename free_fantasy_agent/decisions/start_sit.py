from __future__ import annotations
import pandas as pd
import numpy as np

def start_sit_optimize(weekly_features: pd.DataFrame, roster: pd.DataFrame, slots: dict, bias: str="neutral") -> pd.DataFrame:
    """
    Choose starters that maximize expected points (mean), with simple bias toward floor/ceiling.
    weekly_features must include: player_id, pos, mean, floor_p20, ceil_p80
    roster: your roster with player_id and eligible positions
    slots: dict like {"QB":1,"RB":2,"WR":2,"TE":1,"FLEX":1}
    bias: "neutral" | "floor" | "ceiling"
    """
    wf = weekly_features.set_index("player_id")
    scores = {
        "neutral": wf["mean"],
        "floor": wf["floor_p20"]*0.8 + wf["mean"]*0.2,
        "ceiling": wf["ceil_p80"]*0.8 + wf["mean"]*0.2
    }[bias]
    roster = roster.assign(score=roster["player_id"].map(scores))
    # naive greedy by slot
    starters = []
    used = set()
    for slot, count in slots.items():
        elig = roster[roster["eligible_pos"].apply(lambda ps: (slot in ps) or (slot=="FLEX" and any(p in ["RB","WR","TE"] for p in ps)))]
        elig = elig[~elig["player_id"].isin(used)].sort_values("score", ascending=False).head(count)
        starters.append(elig)
        used.update(elig["player_id"])
    return pd.concat(starters) if starters else pd.DataFrame(columns=roster.columns)
