"""
nflverse data via nfl_data_py.
Docs: https://pypi.org/project/nfl-data-py/
"""
from __future__ import annotations
import pandas as pd
from typing import List, Optional
try:
    import nfl_data_py as nfl
except Exception as e:
    nfl = None

def require():
    if nfl is None:
        raise ImportError("Install nfl_data_py: pip install nfl_data_py")

def load_weekly_stats(seasons: List[int]) -> pd.DataFrame:
    require()
    return nfl.import_weekly_data(seasons)

def load_pbp(seasons: List[int]) -> pd.DataFrame:
    require()
    return nfl.import_pbp_data(seasons)

def load_snap_counts(seasons: List[int]) -> pd.DataFrame:
    """Snap counts from PFR published via nflverse."""
    require()
    return nfl.import_snap_counts(seasons)

def load_schedule(seasons: List[int]) -> pd.DataFrame:
    require()
    return nfl.import_schedules(seasons)

def load_lines(seasons: List[int]) -> pd.DataFrame:
    """Spreads/totals if available via nfl_data_py."""
    require()
    return nfl.import_lines(seasons)

def load_rosters(seasons: List[int]) -> pd.DataFrame:
    require()
    return nfl.import_rosters(seasons)
