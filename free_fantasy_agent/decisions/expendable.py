from __future__ import annotations
import pandas as pd
import numpy as np

def mark_expendable(features_next3w: pd.DataFrame, replacement_next3w: pd.DataFrame) -> pd.DataFrame:
    """
    features_next3w: columns = player_id, mean_next3w, start_prob, role_trend
    replacement_next3w: by position replacement baseline (pos -> mean_next3w)
    """
    f = features_next3w.copy()
    f = f.merge(replacement_next3w, on="pos", how="left", suffixes=("","_repl"))
    f["VAR"] = f["mean_next3w"] - f["mean_next3w_repl"]
    f["expendable"] = (f["VAR"] <= 0) & (f["start_prob"] < 0.25) & ((f["role_trend"] < 0) | (f["redundant"]==True))
    return f[["player_id","pos","VAR","start_prob","role_trend","expendable"]]
