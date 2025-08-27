"""
National Weather Service API (api.weather.gov)
Docs: https://www.weather.gov/documentation/services-web-api
Gridpoints FAQ: https://weather-gov.github.io/api/gridpoints
"""
from __future__ import annotations
import requests, pandas as pd

API = "https://api.weather.gov"

def forecast_by_latlon(lat: float, lon: float) -> dict:
    """Return NWS forecast for a point (uses /points then /gridpoints forecast)."""
    r = requests.get(f"{API}/points/{lat},{lon}", timeout=30, headers={"User-Agent":"free-fantasy-agent/0.1"})
    r.raise_for_status()
    pt = r.json()
    grid = pt["properties"]["forecastHourly"]
    r2 = requests.get(grid, timeout=30, headers={"User-Agent":"free-fantasy-agent/0.1"})
    r2.raise_for_status()
    return r2.json()

def simple_weather_flag(forecast: dict, kickoff_iso: str) -> str:
    """Return a coarse flag like 'windy', 'rain', 'snow', or 'ok' for the kickoff hour."""
    import dateutil.parser as dp
    ko = dp.isoparse(kickoff_iso).replace(minute=0, second=0, microsecond=0)
    periods = forecast.get("properties",{}).get("periods",[])
    # find exact hour match
    for p in periods:
        start = dp.isoparse(p["startTime"]).replace(minute=0, second=0, microsecond=0)
        if start == ko:
            wind = p.get("windSpeed","0 mph")
            mph = 0
            try:
                mph = int(wind.split()[0])
            except Exception:
                pass
            short = (p.get("shortForecast") or "").lower()
            if "snow" in short:
                return "snow"
            if "rain" in short or "showers" in short:
                return "rain"
            if mph >= 15:
                return "windy"
            return "ok"
    return "ok"
