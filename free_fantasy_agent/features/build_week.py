from __future__ import annotations
import pandas as pd
import numpy as np
from typing import List, Tuple

from ..data_sources import nflverse as NV
from .usage import build_usage_features
from .xfp import compute_xfp_from_events
from .environment import implied_totals_from_lines

def pbp_to_opportunities(pbp: pd.DataFrame, season: int, week: int) -> pd.DataFrame:
    """
    Aggregate nflverse play-by-play into per-player-week opportunity counts:
    targets, carries, rz_targets, rz_carries, gl_carries.
    Uses receiver_player_id / rusher_player_id.
    """
    df = pbp[(pbp["season"] == season) & (pbp["week"] == week)].copy()

    # Targets
    # nflfastR convention: a target occurs on pass plays with a receiver (complete or incomplete).
    targ = df[(df["pass"] == 1) & (df["pass_attempt"] == 1)].copy()
    # Some datasets include 'receiver_player_id'; if missing, fall back to name and dropna
    recv_id_col = "receiver_player_id" if "receiver_player_id" in targ.columns else None
    if recv_id_col:
        targ = targ[~targ[recv_id_col].isna()]
        targ["player_id"] = targ[recv_id_col].astype(str)
    else:
        # fallback: no id, give up to avoid bad merges
        targ = targ.iloc[0:0].copy()
        targ["player_id"] = ""

    targ["is_rz"] = targ["yardline_100"].le(20)
    t_grp = targ.groupby("player_id").agg(
        targets=("pass_attempt","size"),
        rz_targets=("is_rz","sum")
    ).reset_index()

    # Carries
    rush = df[df["rush"] == 1].copy()
    rusher_id_col = "rusher_player_id" if "rusher_player_id" in rush.columns else None
    if rusher_id_col:
        rush = rush[~rush[rusher_id_col].isna()]
        rush["player_id"] = rush[rusher_id_col].astype(str)
    else:
        rush = rush.iloc[0:0].copy()
        rush["player_id"] = ""
    rush["is_rz"] = rush["yardline_100"].le(20)
    rush["is_gl"] = rush["yardline_100"].le(5)
    r_grp = rush.groupby("player_id").agg(
        carries=("rush","size"),
        rz_carries=("is_rz","sum"),
        gl_carries=("is_gl","sum")
    ).reset_index()

    opp = pd.merge(t_grp, r_grp, on="player_id", how="outer").fillna(0)
    opp["season"] = season
    opp["week"] = week
    # Ensure integer-like types
    for col in ["targets","rz_targets","carries","rz_carries","gl_carries"]:
        if col in opp.columns:
            opp[col] = opp[col].astype(int)
        else:
            opp[col] = 0
    return opp[["season","week","player_id","targets","carries","rz_targets","rz_carries","gl_carries"]]

def build_week(season: int, week: int) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """Return (weekly_features, events, lines) DataFrames for season/week."""
    weekly = NV.load_weekly_stats([season])
    snaps = NV.load_snap_counts([season])
    pbp = NV.load_pbp([season])
    lines = NV.load_lines([season])

    # Filter current week
    weekly_w = weekly[weekly["week"] == week].copy()
    snaps_w  = snaps[snaps["week"] == week].copy()
    pbp_w = pbp[pbp["week"] == week].copy()
    lines_w = lines[lines["week"] == week].copy() if "week" in lines.columns else pd.DataFrame()

    # Build usage
    usage = build_usage_features(weekly_w, snaps_w)

    # Build opportunities from PBP -> xFP
    events = pbp_to_opportunities(pbp, season, week)
    xfp = compute_xfp_from_events(events)

    # Merge features
    feats = usage.merge(xfp, on=["season","week","player_id"], how="left")
    # crude floor/mean/ceiling proxy until you fit a model
    feats["mean"] = feats["xFP"].fillna(0.0)
    feats["floor_p20"] = 0.65 * feats["mean"]
    feats["ceil_p80"] = 1.35 * feats["mean"]

    # Add implied totals if available
    if not lines_w.empty:
        it = implied_totals_from_lines(lines_w)
        # explode to team rows
        home = it.rename(columns={"home_team":"team","home_total_implied":"team_total"})
        home = home[["season","week","team","team_total"]]
        away = it.rename(columns={"away_team":"team","away_total_implied":"team_total"})
        away = away[["season","week","team","team_total"]]
        teams = pd.concat([home, away], ignore_index=True)
        feats = feats.merge(teams, on=["season","week","team"], how="left")
    else:
        feats["team_total"] = np.nan

    # sort and return
    feats = feats.sort_values(["pos","team","player_id"])
    return feats, events, lines_w
