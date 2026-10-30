"""Download the January-2026 wind datasets from Elexon BMRS into backend/data/.

Only two datasets are used (per the brief):
  * FUELHH  (fuelType=WIND)  -> actual national wind generation, 30-min
  * WINDFOR                  -> forecast wind generation with publishTime

Usage:  python scripts/fetch_data.py
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

BASE = "https://data.elexon.co.uk/bmrs/api/v1/datasets"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# Purchase decisions are made in January 2026 (one day ahead of delivery), so
# forecasts published 1-31 Jan matter, and delivery days run 2 Jan -> 1 Feb.
PUBLISH_FROM = datetime(2026, 1, 1, tzinfo=timezone.utc)
PUBLISH_TO = datetime(2026, 2, 1, tzinfo=timezone.utc)
ACTUALS_FROM = date(2026, 1, 1)
ACTUALS_TO = date(2026, 2, 2)  # a little slack past 1 Feb so every target has an actual


def get_json(path: str, params: dict) -> list[dict]:
    url = f"{BASE}/{path}?{urllib.parse.urlencode(params)}"
    for attempt in range(4):
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                return json.load(resp)
        except Exception as exc:  # network flake / 5xx -> back off and retry
            print(f"  retry {attempt + 1} after {exc}", file=sys.stderr)
            time.sleep(2 ** attempt)
    raise RuntimeError(f"giving up on {url}")


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_forecasts() -> list[dict]:
    rows: list[dict] = []
    cur = PUBLISH_FROM
    step = timedelta(days=2)
    while cur < PUBLISH_TO:
        nxt = min(cur + step, PUBLISH_TO)
        chunk = get_json("WINDFOR/stream", {
            "publishDateTimeFrom": iso(cur),
            "publishDateTimeTo": iso(nxt),
        })
        print(f"WINDFOR {iso(cur)} -> {iso(nxt)}: {len(chunk)} rows")
        rows.extend(chunk)
        cur = nxt
    return rows


def fetch_actuals() -> list[dict]:
    rows: list[dict] = []
    cur = ACTUALS_FROM
    while cur <= ACTUALS_TO:
        nxt = min(cur + timedelta(days=6), ACTUALS_TO)
        chunk = get_json("FUELHH/stream", {
            "settlementDateFrom": cur.isoformat(),
            "settlementDateTo": nxt.isoformat(),
            "fuelType": "WIND",
        })
        print(f"FUELHH {cur} -> {nxt}: {len(chunk)} rows")
        rows.extend(chunk)
        cur = nxt + timedelta(days=1)
    return rows


def main() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    forecasts = [
        {"publishTime": r["publishTime"], "startTime": r["startTime"], "generation": r["generation"]}
        for r in fetch_forecasts()
    ]
    actuals = [
        {"startTime": r["startTime"], "generation": r["generation"]}
        for r in fetch_actuals()
        if r.get("fuelType") == "WIND"
    ]
    # De-duplicate on natural keys and sort, so the snapshot is deterministic.
    forecasts = sorted({(r["publishTime"], r["startTime"]): r for r in forecasts}.values(),
                       key=lambda r: (r["publishTime"], r["startTime"]))
    actuals = sorted({r["startTime"]: r for r in actuals}.values(), key=lambda r: r["startTime"])
    (DATA_DIR / "windfor_jan2026.json").write_text(json.dumps(forecasts, separators=(",", ":")))
    (DATA_DIR / "fuelhh_wind_jan2026.json").write_text(json.dumps(actuals, separators=(",", ":")))
    (DATA_DIR / "snapshot_meta.json").write_text(json.dumps({
        "fetchedAt": iso(datetime.now(timezone.utc)),
        "forecastRows": len(forecasts),
        "actualRows": len(actuals),
        "source": "Elexon BMRS (FUELHH WIND, WINDFOR)",
    }, indent=2))
    print(f"saved {len(forecasts)} forecast rows, {len(actuals)} actual rows")


if __name__ == "__main__":
    main()
