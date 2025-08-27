from __future__ import annotations
import pandas as pd
import numpy as np

def matchup_grade(team_week_stats: pd.DataFrame) -> pd.Series:
    """
    Very rough defensive matchup grade by position using recent EPA allowed + yards/target or rush EPA allowed.
    Placeholder: user should implement with nflverse team defense splits.
    """
    return pd.Series(0.0, index=team_week_stats.index)

def implied_totals_from_lines(lines_df: pd.DataFrame) -> pd.DataFrame:
    """Compute implied team totals from spread/total lines.
       lines_df needs: season, week, home_team, away_team, spread_line (home favorite negative), total_line.
    """
    df = lines_df.copy()
    # standard formula
    df["home_total_implied"] = (df["total_line"] / 2) - (df["spread_line"] / 2)
    df["away_total_implied"] = (df["total_line"] / 2) + (df["spread_line"] / 2)
    return df[["season","week","home_team","away_team","home_total_implied","away_total_implied"]]
