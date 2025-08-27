# Free Fantasy Agent (skeleton)

A lean, **free-first** scaffold to power fantasy-football decisions without paid data feeds.

## What it does (today)
- Defines **schemas** for players, weekly features, insights, and decisions.
- Provides **loader stubs** for:
  - Sleeper players (free)
  - nflverse data via `nfl_data_py` (play-by-play, weekly stats, snap counts)
  - National Weather Service (NWS) API for game-day weather flags
- Implements **feature builders** (xFP, usage shares, red-zone opps, replacement levels).
- Implements **decision rules** (expendable, waivers + FAB, start/sit optimizer) using simple heuristics.

> NOTE: Internet access is required at runtime to download data. This notebook only wrote files.
> Install deps in your project env and run `python -m free_fantasy_agent.cli --help`.

## Install (local dev)
```bash
pip install -U nfl_data_py requests pydantic pandas numpy scipy python-dateutil
# optional: for Yahoo OAuth you'll need a separate client or library
```

## Quickstart
```bash
python -m free_fantasy_agent.cli bootstrap --season 2025
python -m free_fantasy_agent.cli weekly --season 2025 --week 1 --league_source sleeper --league_id <your_league_id>
```

## Folders
- `data_sources/`: adapters for free sources (Sleeper, nflverse via nfl_data_py, NWS).
- `features/`: compute xFP, usage, environment, replacement levels.
- `decisions/`: expendables, waivers+FAB bids, start/sit.
- `schemas/`: JSON Schemas for validation + interop.
- `config/`: yaml for league settings and scoring rules.
- `utils/`: shared helpers.
