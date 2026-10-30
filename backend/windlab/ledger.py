"""The ledger: every wind forecast Elexon published, and what was actually metered.

The key operation is `as_of`, a point-in-time join. For a target hour and a cutoff it
returns the newest forecast published no later than that cutoff. Nothing in the rest of
the package can see a forecast that was not yet public, which is what keeps the
accuracy numbers honest.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

DEFAULT_DIR = Path(os.environ.get("WINDLAB_DATA", Path(__file__).resolve().parent.parent / "data"))


@dataclass(frozen=True)
class Ledger:
    publications: pd.DataFrame  # publish_time, target, forecast_mw; sorted by publish_time
    metered: pd.Series  # index: target (UTC), values: metered wind MW, half-hourly
    snapshot: dict = field(default_factory=dict)

    @classmethod
    def from_snapshot(cls, data_dir: Path = DEFAULT_DIR) -> Ledger:
        forecasts = json.loads((data_dir / "windfor_jan2026.json").read_text())
        actuals = json.loads((data_dir / "fuelhh_wind_jan2026.json").read_text())
        snapshot_path = data_dir / "snapshot_meta.json"

        publications = pd.DataFrame({
            "publish_time": pd.to_datetime([r["publishTime"] for r in forecasts], utc=True),
            "target": pd.to_datetime([r["startTime"] for r in forecasts], utc=True),
            "forecast_mw": [float(r["generation"]) for r in forecasts],
        }).sort_values("publish_time", kind="stable", ignore_index=True)

        metered = pd.Series(
            [float(r["generation"]) for r in actuals],
            index=pd.DatetimeIndex(pd.to_datetime([r["startTime"] for r in actuals], utc=True)),
            name="metered_mw",
        ).sort_index()

        snapshot = json.loads(snapshot_path.read_text()) if snapshot_path.exists() else {}
        return cls(publications, metered, snapshot)

    def as_of(self, targets: pd.DataFrame) -> pd.DataFrame:
        """Attach the newest forecast published at or before each row's cutoff.

        `targets` needs `target` and `cutoff` columns. Rows with no visible forecast are dropped.
        """
        left = targets.assign(cutoff=pd.to_datetime(targets["cutoff"], utc=True)).sort_values("cutoff")
        joined = pd.merge_asof(
            left,
            self.publications,
            left_on="cutoff",
            right_on="publish_time",
            by="target",
            direction="backward",
        )
        return joined.dropna(subset=["forecast_mw"]).reset_index(drop=True)

    def metered_for(self, align: str) -> pd.Series:
        """Actuals keyed by target hour.

        exact:       the half-hour that starts at the target
        hourly_mean: the mean of the two half-hours inside the target hour
        """
        if align == "exact":
            return self.metered
        shifted = self.metered.copy()
        shifted.index = shifted.index - pd.Timedelta(minutes=30)
        both = pd.concat([self.metered, shifted], axis=1, keys=["first", "second"]).dropna()
        return both.mean(axis=1)
