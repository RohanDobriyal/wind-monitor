"""Accuracy statistics. Every function takes a frame that has actuals and error columns."""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class Score:
    n: int
    mae: float
    rmse: float
    bias: float
    wape_pct: float
    p90_shortfall: float
    p95_abs_error: float
    max_abs_error: float
    mean_actual_mw: float
    over_forecast_pct: float


def score(scored: pd.DataFrame) -> Score:
    err = scored["error_mw"]
    abs_err = scored["abs_error_mw"]
    actual = scored["actual_mw"]
    return Score(
        n=len(scored),
        mae=float(abs_err.mean()),
        rmse=float(np.sqrt((err ** 2).mean())),
        bias=float(err.mean()),
        wape_pct=float(abs_err.sum() / actual.sum() * 100),
        p90_shortfall=float(err.quantile(0.9)),
        p95_abs_error=float(abs_err.quantile(0.95)),
        max_abs_error=float(abs_err.max()),
        mean_actual_mw=float(actual.mean()),
        over_forecast_pct=float((err > 0).mean() * 100),
    )


def by_day(scored: pd.DataFrame) -> list[dict]:
    rows = []
    for day, group in scored.groupby("delivery_date"):
        stats = score(group)
        rows.append({
            "date": day.isoformat(),
            "mean_forecast_mw": float(group["forecast_mw"].mean()),
            "mean_actual_mw": stats.mean_actual_mw,
            "mae": stats.mae,
            "bias": stats.bias,
        })
    return rows


def by_hour(scored: pd.DataFrame) -> list[dict]:
    rows = []
    for hour, group in scored.groupby("hour"):
        stats = score(group)
        rows.append({"hour": int(hour), "mae": stats.mae, "bias": stats.bias})
    return rows


def by_level(scored: pd.DataFrame, quartiles: int = 4) -> list[dict]:
    """Error by how windy the forecast said it would be."""
    bucket = pd.qcut(scored["forecast_mw"], quartiles, duplicates="drop")
    rows = []
    for interval, group in scored.groupby(bucket, observed=True):
        stats = score(group)
        rows.append({
            "lo_mw": float(interval.left),
            "hi_mw": float(interval.right),
            "n": stats.n,
            "mae": stats.mae,
            "bias": stats.bias,
            "rmse": stats.rmse,
            "p90_shortfall": stats.p90_shortfall,
            "p10_error": float(group["error_mw"].quantile(0.1)),
        })
    return rows


def histogram(scored: pd.DataFrame, width_mw: int = 500) -> list[dict]:
    err = scored["error_mw"]
    lo = np.floor(err.min() / width_mw) * width_mw
    hi = np.ceil(err.max() / width_mw) * width_mw
    edges = np.arange(lo, hi + width_mw, width_mw)
    counts, _ = np.histogram(err, bins=edges)
    return [
        {"from_mw": float(edges[i]), "to_mw": float(edges[i + 1]), "count": int(count)}
        for i, count in enumerate(counts)
    ]


def pairs(scored: pd.DataFrame) -> list[dict]:
    return [
        {"forecast_mw": float(f), "actual_mw": float(a)}
        for f, a in zip(scored["forecast_mw"], scored["actual_mw"])
    ]


def lead_curve(priced: pd.DataFrame, bin_h: int = 3, max_h: int = 66) -> list[dict]:
    """Error grouped by how many hours before delivery the forecast was published."""
    usable = priced.dropna(subset=["actual_mw"])
    usable = usable[(usable["lead_h"] >= 0) & (usable["lead_h"] < max_h)]
    lead_bin = (usable["lead_h"] // bin_h * bin_h).astype(int)
    rows = []
    for start, group in usable.groupby(lead_bin):
        stats = score(group)
        rows.append({
            "from_h": int(start),
            "to_h": int(start) + bin_h,
            "n": stats.n,
            "mae": stats.mae,
            "rmse": stats.rmse,
            "bias": stats.bias,
        })
    return rows
