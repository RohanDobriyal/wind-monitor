"""The engine prices the ledger against the window and remembers the answers.

It is the only module that combines the ledger, the window and the risk model.
Results are memoised per (gate, alignment), so a request costs a dictionary lookup
after the first build. Each `Engine` keeps its own memo, so tests never share state.
"""
from __future__ import annotations

from datetime import date

import pandas as pd

from . import risk, window
from .ledger import Ledger
from .window import Gate


class Engine:
    def __init__(self, ledger: Ledger):
        self.ledger = ledger
        self._memo: dict[tuple, object] = {}

    def _remember(self, key: tuple, build):
        if key not in self._memo:
            self._memo[key] = build()
        return self._memo[key]

    def _price(self, frame: pd.DataFrame, align: str) -> pd.DataFrame:
        priced = frame.copy()
        priced["actual_mw"] = priced["target"].map(self.ledger.metered_for(align))
        priced["error_mw"] = priced["forecast_mw"] - priced["actual_mw"]
        priced["abs_error_mw"] = priced["error_mw"].abs()
        priced["lead_h"] = (priced["target"] - priced["publish_time"]).dt.total_seconds() / 3600
        return priced

    def decisions(self, gate: Gate, align: str = "exact") -> pd.DataFrame:
        """Every delivery hour, priced against the newest forecast visible at this gate."""
        def build():
            visible = self.ledger.as_of(window.delivery_hours(gate))
            return self._price(visible, align)
        return self._remember(("decisions", gate.label, align), build)

    def lagged_forecast(self, gate: Gate, hours_before: int = 24) -> pd.Series:
        """What the forecast for each hour looked like `hours_before` the gate closed."""
        def build():
            targets = window.delivery_hours(gate)
            targets["cutoff"] = targets["cutoff"] - pd.Timedelta(hours=hours_before)
            visible = self.ledger.as_of(targets)
            return visible.set_index("target")["forecast_mw"]
        return self._remember(("lagged", gate.label, hours_before), build)

    def error_model(self, gate: Gate, align: str = "exact") -> risk.ErrorModel:
        def build():
            scored = self.decisions(gate, align).dropna(subset=["actual_mw"])
            return risk.ErrorModel.fit(scored)
        return self._remember(("model", gate.label, align), build)

    def backtest(self, gate: Gate, align: str = "exact") -> dict | None:
        def build():
            scored = self.decisions(gate, align).dropna(subset=["actual_mw"])
            return risk.rolling_backtest(scored)
        return self._remember(("backtest", gate.label, align), build)

    def every_publication(self, align: str = "exact") -> pd.DataFrame:
        """All publications that target the window, priced. Used for the lead-time curve."""
        def build():
            start, end = window.span()
            pubs = self.ledger.publications
            inside = pubs[(pubs["target"] >= start) & (pubs["target"] < end)]
            return self._price(inside, align)
        return self._remember(("publications", align), build)

    def delivery_day(self, day: date, gate: Gate, align: str = "exact") -> pd.DataFrame:
        frame = self.decisions(gate, align)
        return frame[frame["delivery_date"] == day].sort_values("target")
