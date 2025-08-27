from __future__ import annotations
import pandas as pd
import numpy as np

def build_usage_features(weekly_stats: pd.DataFrame, snap_counts: pd.DataFrame) -> pd.DataFrame:
    """
    Returns per-player-week usage signals: snap_pct, target_share, air_yd_share, carries, targets, rz_opps, goal_line_carries, aDOT.
    Inputs expected columns (nfl_data_py weekly & snaps usually provide):
      weekly_stats: season, week, player_id, team, position, attempts, carries, targets, air_yards, tds, yds, redzone_targets, redzone_carries, etc.
      snap_counts: season, week, player_id, team, offense_pct (or snaps_offense / team_offense_snaps)
    """
    ws = weekly_stats.copy()
    sc = snap_counts.copy()

    # snap pct
    if "offense_pct" in sc.columns:
        snap = sc[["season","week","player_id","offense_pct"]].rename(columns={"offense_pct":"snap_pct"})
    elif {"offense_snaps","team_offense_snaps"}.issubset(set(sc.columns)):
        snap = sc.assign(snap_pct = 100*sc["offense_snaps"]/sc["team_offense_snaps"])[["season","week","player_id","snap_pct"]]
    else:
        snap = sc[["season","week","player_id"]].assign(snap_pct=np.nan)

    # basic opps
    cols = {c:c for c in ["season","week","player_id","team","position","carries","targets","air_yards"] if c in ws.columns}
    base = ws[list(cols)].rename(columns=cols)

    # red zone & goal line approximations
    for c in ["redzone_targets","redzone_carries","goal_line_carries","aDOT"]:
        if c not in ws.columns:
            ws[c] = np.nan

    base = base.merge(ws[["season","week","player_id","redzone_targets","redzone_carries","goal_line_carries","aDOT"]], on=["season","week","player_id"], how="left")

    # team shares (requires team totals per week; if missing, skip)
    shares = []
    for (season, week, team), g in base.groupby(["season","week","team"]):
        t_targets = g["targets"].sum(skipna=True)
        t_air = g["air_yards"].sum(skipna=True)
        for _, r in g.iterrows():
            shares.append({
                "season": season, "week": week, "player_id": r["player_id"],
                "target_share": (r["targets"]/t_targets if t_targets else np.nan),
                "air_yd_share": (r["air_yards"]/t_air if t_air else np.nan),
            })
    shares = pd.DataFrame(shares)
    out = base.merge(snap, on=["season","week","player_id"], how="left").merge(shares, on=["season","week","player_id"], how="left")
    out = out.rename(columns={"position":"pos"})
    out["red_zone_opps"] = out["redzone_targets"].fillna(0) + out["redzone_carries"].fillna(0)
    return out
