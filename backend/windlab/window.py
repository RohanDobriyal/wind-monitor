"""The delivery calendar and the gate closures every other module is measured against.

All London-time rules live in this file. Everything downstream works in UTC.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

LONDON = ZoneInfo("Europe/London")
UTC = timezone.utc

# Bids are placed in January 2026, so the delivery days are 2 Jan to 1 Feb.
FIRST_DELIVERY = date(2026, 1, 2)
LAST_DELIVERY = date(2026, 2, 1)


@dataclass(frozen=True)
class Gate:
    label: str
    at: time
    name: str = field(default="", compare=False)

    def cutoff(self, delivery_day: date) -> pd.Timestamp:
        """Gate closure as a UTC instant. It falls on the day before delivery, in London time."""
        local = datetime.combine(delivery_day - timedelta(days=1), self.at, tzinfo=LONDON)
        return pd.Timestamp(local.astimezone(UTC))

    @classmethod
    def parse(cls, text: str, name: str = "") -> Gate:
        try:
            hh, mm = (int(part) for part in text.split(":"))
            return cls(f"{hh:02d}:{mm:02d}", time(hh, mm), name)
        except ValueError as exc:
            raise ValueError(f"gate must be HH:MM, got {text!r}") from exc


EPEX = Gate("09:20", time(9, 20), "EPEX GB day-ahead")
N2EX = Gate("09:50", time(9, 50), "N2EX day-ahead")
GATES = (EPEX, N2EX)


def delivery_days() -> list[date]:
    count = (LAST_DELIVERY - FIRST_DELIVERY).days + 1
    return [FIRST_DELIVERY + timedelta(days=i) for i in range(count)]


def span() -> tuple[pd.Timestamp, pd.Timestamp]:
    """UTC bounds of the whole window: [first delivery midnight, day after the last one)."""
    start = datetime.combine(FIRST_DELIVERY, time(0), tzinfo=LONDON).astimezone(UTC)
    end = datetime.combine(LAST_DELIVERY + timedelta(days=1), time(0), tzinfo=LONDON).astimezone(UTC)
    return pd.Timestamp(start), pd.Timestamp(end)


def delivery_hours(gate: Gate) -> pd.DataFrame:
    """One row per delivery hour in the window, with the cutoff it is bid against."""
    start, end = span()
    targets = pd.date_range(start, end, freq="h", inclusive="left")
    local = targets.tz_convert(LONDON)
    frame = pd.DataFrame({"target": targets, "delivery_date": local.date, "hour": local.hour})
    cutoffs = {day: gate.cutoff(day) for day in delivery_days()}
    frame["cutoff"] = pd.to_datetime(frame["delivery_date"].map(cutoffs), utc=True)
    return frame
