"""Shapes the engine's answers into the two screens of the app and the CSV export."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from typing import Any

import pandas as pd

from . import scorecard, window
from .engine import Engine
from .window import Gate

CURVE_GATES = sorted(
    {Gate.parse(f"{h:02d}:{m:02d}") for h in range(6, 13) for m in (0, 30)} | set(window.GATES),
    key=lambda g: g.label,
)


@dataclass(frozen=True)
class Hour:
    target: pd.Timestamp
    hour: int
    forecast_mw: float
    publish_time: pd.Timestamp
    lead_h: float
    change_24h_mw: float | None
    p10_mw: float
    p50_mw: float
    p90_mw: float
    cover_mw: float
    metered_mw: float | None
    error_mw: float | None


def _or_none(value: Any) -> Any:
    return None if pd.isna(value) else value


def desk(engine: Engine, day: date, gate: Gate, align: str) -> dict:
    """Everything the Desk screen needs for one delivery day."""
    hours = engine.delivery_day(day, gate, align)
    model = engine.error_model(gate, align)
    prior = engine.lagged_forecast(gate)
    cutoff = gate.cutoff(day)

    plans = []
    for row in hours.itertuples():
        band = model.band(row.forecast_mw)
        before = prior.get(row.target)
        plans.append(Hour(
            target=row.target,
            hour=row.hour,
            forecast_mw=float(row.forecast_mw),
            publish_time=row.publish_time,
            lead_h=float(row.lead_h),
            change_24h_mw=None if before is None or pd.isna(before) else float(row.forecast_mw - before),
            p10_mw=band.p10,
            p50_mw=band.p50,
            p90_mw=band.p90,
            cover_mw=band.cover_mw,
            metered_mw=_or_none(row.actual_mw),
            error_mw=_or_none(row.error_mw),
        ))

    start = pd.Timestamp(datetime.combine(day, time(0), tzinfo=window.LONDON).astimezone(window.UTC))
    end = start + pd.Timedelta(hours=24)
    pubs = engine.ledger.publications
    recent = pubs[
        (pubs["target"] >= start) & (pubs["target"] < end)
        & (pubs["publish_time"] >= cutoff - pd.Timedelta(hours=30))
        & (pubs["publish_time"] <= end)
    ]
    publications = [
        {
            "publish_time": publish,
            "usable": publish <= cutoff,
            "points": [{"t": t, "v": v} for t, v in zip(group["target"], group["forecast_mw"])],
        }
        for publish, group in recent.groupby("publish_time")
    ]

    metered = engine.ledger.metered
    metered = metered[(metered.index >= start) & (metered.index < end)]
    usable = [p for p in plans if p.change_24h_mw is not None]
    values = [p.forecast_mw for p in plans]

    return {
        "day": day,
        "gate": {"label": gate.label, "name": gate.name, "cutoff": cutoff},
        "summary": {
            "latest_publish": hours["publish_time"].max() if len(hours) else None,
            "publications_used": len(set(hours["publish_time"])),
            "avg_forecast_mw": sum(values) / len(values),
            "peak_mw": max(values),
            "trough_mw": min(values),
            "energy_mwh": sum(values),
            "avg_p10_mw": sum(p.p10_mw for p in plans) / len(plans),
            "avg_p50_mw": sum(p.p50_mw for p in plans) / len(plans),
            "avg_p90_mw": sum(p.p90_mw for p in plans) / len(plans),
            "avg_cover_mw": sum(p.cover_mw for p in plans) / len(plans),
            "avg_change_24h_mw": sum(p.change_24h_mw for p in usable) / len(usable) if usable else None,
        },
        "hours": plans,
        "publications": publications,
        "metered": [{"t": t, "v": v} for t, v in metered.items()],
    }


def scorecard_for(engine: Engine, gate: Gate, align: str) -> dict:
    """Everything the Scorecard screen needs for one gate and alignment."""
    decisions = engine.decisions(gate, align)
    scored = decisions.dropna(subset=["actual_mw"])
    model = engine.error_model(gate, align)
    return {
        "gate": {"label": gate.label, "name": gate.name},
        "align": align,
        "overall": scorecard.score(scored).__dict__,
        "lead": {
            "min_h": float(decisions["lead_h"].min()),
            "max_h": float(decisions["lead_h"].max()),
            "mean_h": float(decisions["lead_h"].mean()),
        },
        "band_hit_pct": model.hit_rate(scored) * 100,
        "tiers": [t.__dict__ for t in model.tiers],
        "backtest": engine.backtest(gate, align),
        "by_day": scorecard.by_day(scored),
        "by_hour": scorecard.by_hour(scored),
        "by_level": scorecard.by_level(scored),
        "histogram": scorecard.histogram(scored),
        "pairs": scorecard.pairs(scored),
        "lead_curve": scorecard.lead_curve(engine.every_publication(align)),
        "gate_curve": _gate_curve(engine, align),
    }


def _gate_curve(engine: Engine, align: str) -> list[dict]:
    rows = []
    for gate in CURVE_GATES:
        frame = engine.decisions(gate, align)
        stats = scorecard.score(frame.dropna(subset=["actual_mw"]))
        rows.append({
            "gate": gate.label,
            "mae": stats.mae,
            "rmse": stats.rmse,
            "bias": stats.bias,
            "mean_lead_h": float(frame["lead_h"].mean()),
        })
    return rows


def export_frame(engine: Engine, gate: Gate, align: str) -> pd.DataFrame:
    frame = engine.decisions(gate, align)
    out = pd.DataFrame({
        "target_utc": frame["target"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "forecast_published_utc": frame["publish_time"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "lead_hours": frame["lead_h"].round(2),
        "forecast_mw": frame["forecast_mw"].round(1),
        "actual_mw": frame["actual_mw"].round(1),
        "error_mw": frame["error_mw"].round(1),
    })
    return out
