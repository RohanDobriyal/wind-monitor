from datetime import date

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from windlab import risk, scorecard, window
from windlab.api import create_app
from windlab.engine import Engine
from windlab.ledger import Ledger
from windlab.window import EPEX, N2EX


@pytest.fixture(scope="module")
def engine():
    return Engine(Ledger.from_snapshot())


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as c:
        yield c


# ----------------------------------------------------------------- calendar
def test_window_has_every_delivery_hour():
    hours = window.delivery_hours(EPEX)
    assert len(hours) == 31 * 24
    assert hours["delivery_date"].nunique() == 31


def test_cutoff_is_london_time_on_the_day_before():
    assert EPEX.cutoff(date(2026, 1, 15)) == pd.Timestamp("2026-01-14T09:20:00Z")
    assert N2EX.cutoff(date(2026, 1, 15)) == pd.Timestamp("2026-01-14T09:50:00Z")


def test_gate_parse_rejects_nonsense():
    with pytest.raises(ValueError):
        window.Gate.parse("nine o'clock")


# ----------------------------------------------------------------- as-of join
def test_as_of_join_matches_brute_force(engine):
    """Compare the merge_asof join with a plain filter-and-sort on a random sample of hours."""
    ledger = engine.ledger
    targets = window.delivery_hours(EPEX)
    joined = ledger.as_of(targets).set_index("target")["publish_time"]

    rng = np.random.default_rng(7)
    for idx in rng.choice(len(targets), size=60, replace=False):
        row = targets.iloc[idx]
        pubs = ledger.publications
        visible = pubs[(pubs["target"] == row["target"]) & (pubs["publish_time"] <= row["cutoff"])]
        expected = visible["publish_time"].max()
        assert joined.loc[row["target"]] == expected


def test_no_forecast_is_used_after_its_gate(engine):
    for g in (window.Gate.parse("06:00"), EPEX, N2EX, window.Gate.parse("12:00")):
        decisions = engine.decisions(g)
        cutoffs = decisions["delivery_date"].map(g.cutoff)
        assert (decisions["publish_time"] <= cutoffs).all(), g.label


def test_gate_decides_how_fresh_the_forecast_is(engine):
    early = engine.decisions(EPEX)["publish_time"].dt.strftime("%H:%M").unique()
    late = engine.decisions(N2EX)["publish_time"].dt.strftime("%H:%M").unique()
    assert list(early) == ["07:30"] and list(late) == ["09:30"]


def test_error_is_forecast_minus_actual(engine):
    d = engine.decisions(EPEX).dropna(subset=["actual_mw"])
    assert np.allclose(d["error_mw"], d["forecast_mw"] - d["actual_mw"])


def test_hourly_mean_is_mean_of_two_half_hours(engine):
    metered = engine.ledger.metered
    hourly = engine.ledger.metered_for("hourly_mean")
    t = pd.Timestamp("2026-01-15T12:00:00Z")
    assert hourly[t] == pytest.approx((metered[t] + metered[t + pd.Timedelta(minutes=30)]) / 2)


# ----------------------------------------------------------------- scoring
def test_score_on_known_values():
    df = pd.DataFrame({"forecast_mw": [110.0, 90.0, 120.0], "actual_mw": [100.0] * 3})
    df["error_mw"] = df["forecast_mw"] - df["actual_mw"]
    df["abs_error_mw"] = df["error_mw"].abs()
    s = scorecard.score(df)
    assert s.mae == pytest.approx(40 / 3)
    assert s.bias == pytest.approx(20 / 3)
    assert s.rmse == pytest.approx(((100 + 100 + 400) / 3) ** 0.5)
    assert s.wape_pct == pytest.approx(40 / 300 * 100)


def test_band_is_ordered_and_never_negative(engine):
    model = engine.error_model(EPEX)
    for fc in (500.0, 5_000.0, 12_000.0, 20_000.0):
        band = model.band(fc)
        assert 0 <= band.p10 <= band.p50 <= band.p90


def test_backtest_is_out_of_sample_and_helps(engine):
    bt = engine.backtest(EPEX)
    assert bt["from_day"] == "2026-01-10"
    assert 60 <= bt["hit_pct"] <= 95
    assert bt["mae_adjusted"] < bt["mae_raw"]


# ----------------------------------------------------------------- HTTP
def test_health_and_catalog(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    cat = client.get("/api/catalog").json()
    assert cat["days"][0] == "2026-01-02" and cat["days"][-1] == "2026-02-01"
    assert [g["label"] for g in cat["gates"]] == ["09:20", "09:50"]


def test_desk_payload(client):
    body = client.get("/api/desk", params={"day": "2026-01-15"}).json()
    assert len(body["hours"]) == 24 and len(body["metered"]) == 48
    assert body["gate"]["label"] == "09:20"
    assert body["gate"]["cutoff"] == "2026-01-14T09:20:00Z"
    first = body["hours"][0]
    assert first["p10_mw"] <= first["p50_mw"] <= first["p90_mw"]
    assert any(not p["usable"] for p in body["publications"])


def test_desk_rejects_days_outside_the_window(client):
    assert client.get("/api/desk", params={"day": "2025-12-31"}).status_code == 404
    assert client.get("/api/desk", params={"day": "2026-01-15", "gate": "12:00"}).status_code == 422
    assert client.get("/api/desk", params={"day": "nonsense"}).status_code == 422


def test_scorecard_payload(client):
    body = client.get("/api/scorecard", params={"gate": "09:50"}).json()
    assert body["overall"]["n"] == 744
    assert {"by_day", "by_hour", "by_level", "histogram", "lead_curve", "gate_curve", "backtest"} <= body.keys()


def test_csv_export(client):
    r = client.get("/api/export.csv")
    lines = r.text.splitlines()
    assert r.status_code == 200 and lines[0].startswith("target_utc,forecast_published_utc")
    assert len(lines) == 745


def test_unknown_api_path_is_404_not_the_ui(client):
    assert client.get("/api/nope").status_code == 404
