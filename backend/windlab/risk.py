"""How wrong the forecast tends to be, and what range to plan around.

Wind errors grow with wind, so the error distribution is fitted separately for each
tier of forecast level. Error is forecast minus actual, so a positive error means the
wind did not turn up and the shortfall has to be bought elsewhere.
"""
from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import timedelta

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Tier:
    lo: float
    hi: float
    n: int
    q10: float
    q50: float
    q90: float


@dataclass(frozen=True)
class Band:
    p10: float  # pessimistic wind: planning for this leaves a buffer 9 hours in 10
    p50: float  # forecast with the typical over-forecast removed
    p90: float  # optimistic wind
    cover_mw: float  # 1-in-10 shortfall at this forecast level


class ErrorModel:
    def __init__(self, tiers: list[Tier]):
        self.tiers = tiers

    @classmethod
    def fit(cls, scored: pd.DataFrame, tiers: int = 3) -> ErrorModel:
        """`scored` needs forecast_mw and error_mw."""
        bucket = pd.qcut(scored["forecast_mw"], tiers, duplicates="drop")
        fitted = []
        for interval, group in scored.groupby(bucket, observed=True):
            err = group["error_mw"]
            fitted.append(Tier(
                lo=float(interval.left),
                hi=float(interval.right),
                n=len(group),
                q10=float(err.quantile(0.1)),
                q50=float(err.quantile(0.5)),
                q90=float(err.quantile(0.9)),
            ))
        fitted[0] = replace(fitted[0], lo=float("-inf"))
        fitted[-1] = replace(fitted[-1], hi=float("inf"))
        return cls(fitted)

    def tier_for(self, forecast: float) -> Tier:
        for tier in self.tiers:
            if tier.lo < forecast <= tier.hi:
                return tier
        return self.tiers[-1]

    def band(self, forecast: float) -> Band:
        tier = self.tier_for(forecast)
        return Band(
            p10=max(0.0, forecast - tier.q90),
            p50=max(0.0, forecast - tier.q50),
            p90=forecast - tier.q10,
            cover_mw=tier.q90,
        )

    def hit_rate(self, scored: pd.DataFrame) -> float:
        """Share of hours whose actual landed inside the 80% band. Fitted on the same data, so optimistic."""
        hits = 0
        for row in scored.itertuples():
            band = self.band(row.forecast_mw)
            hits += band.p10 <= row.actual_mw <= band.p90
        return hits / len(scored)


def rolling_backtest(scored: pd.DataFrame, tiers: int = 3, min_days: int = 7) -> dict | None:
    """Out-of-sample check of the band and the bias correction.

    For each delivery day, the model is fitted only on days whose actuals were known when
    that day's bid was placed (two days earlier or before), then applied to the day itself.
    """
    days = sorted(scored["delivery_date"].unique())
    rows = []
    first_fitted = None
    for day in days:
        known = scored[scored["delivery_date"] <= day - timedelta(days=2)]
        if known["delivery_date"].nunique() < min_days:
            continue
        first_fitted = first_fitted or day
        model = ErrorModel.fit(known, tiers)
        for row in scored[scored["delivery_date"] == day].itertuples():
            band = model.band(row.forecast_mw)
            rows.append((row.actual_mw, row.forecast_mw, band.p10, band.p50, band.p90))
    if not rows:
        return None

    actual, raw, p10, p50, p90 = np.array(rows).T
    mae_raw = float(np.abs(raw - actual).mean())
    mae_adjusted = float(np.abs(p50 - actual).mean())
    return {
        "from_day": first_fitted.isoformat(),
        "hours": len(rows),
        "hit_pct": float(((actual >= p10) & (actual <= p90)).mean() * 100),
        "mae_raw": mae_raw,
        "mae_adjusted": mae_adjusted,
        "error_reduction_pct": (mae_raw - mae_adjusted) / mae_raw * 100,
        "bias_raw": float((raw - actual).mean()),
        "bias_adjusted": float((p50 - actual).mean()),
    }
