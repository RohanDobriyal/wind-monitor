"""HTTP surface: query validation, the JSON views, the CSV export and the built UI."""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import views, window
from .engine import Engine
from .ledger import Ledger
from .wire import wire

STATIC_DIR = Path(os.environ.get("WINDLAB_STATIC", Path(__file__).resolve().parent.parent / "static"))

GateName = Literal["09:20", "09:50"]
AlignName = Literal["exact", "hourly_mean"]
GATE_BY_LABEL = {g.label: g for g in window.GATES}
GateQuery = Query(default="09:20", description="Gate closure, London time, the day before delivery")
AlignQuery = Query(default="exact", description="exact = same start time; hourly_mean = mean of the two half-hours")


def create_app(ledger: Ledger | None = None, static_dir: Path = STATIC_DIR) -> FastAPI:
    engine = Engine(ledger or Ledger.from_snapshot())

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # Build both gates and both alignments once, so the first visitor isn't the one who waits.
        for gate in window.GATES:
            for align in ("exact", "hourly_mean"):
                views.scorecard_for(engine, gate, align)
        yield

    app = FastAPI(title="windlab", version="2.0.0", lifespan=lifespan)
    app.state.engine = engine

    def gate_of(label: str):
        return GATE_BY_LABEL[label]

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.get("/api/catalog")
    def catalog():
        start, end = window.span()
        return wire({
            "days": [d.isoformat() for d in window.delivery_days()],
            "gates": [{"label": g.label, "name": g.name} for g in window.GATES],
            "default_gate": window.EPEX.label,
            "aligns": ["exact", "hourly_mean"],
            "window": {"from": start, "to": end},
            "snapshot": engine.ledger.snapshot,
        })

    @app.get("/api/desk")
    def desk(day: date, gate: GateName = GateQuery, align: AlignName = AlignQuery):
        if not window.FIRST_DELIVERY <= day <= window.LAST_DELIVERY:
            raise HTTPException(404, f"{day} is outside the window {window.FIRST_DELIVERY} to {window.LAST_DELIVERY}")
        return wire(views.desk(engine, day, gate_of(gate), align))

    @app.get("/api/scorecard")
    def scorecard(gate: GateName = GateQuery, align: AlignName = AlignQuery):
        return wire(views.scorecard_for(engine, gate_of(gate), align))

    @app.get("/api/export.csv")
    def export(gate: GateName = GateQuery, align: AlignName = AlignQuery):
        frame = views.export_frame(engine, gate_of(gate), align)
        name = f"windlab_{gate.replace(':', '')}_{align}.csv"
        return Response(
            frame.to_csv(index=False),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={name}"},
        )

    if static_dir.exists():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        @app.get("/{path:path}", include_in_schema=False)
        def spa(path: str):
            if path.startswith("api/"):
                return JSONResponse({"detail": "Not Found"}, status_code=404)
            candidate = (static_dir / path).resolve()
            if path and candidate.is_file() and static_dir.resolve() in candidate.parents:
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

    return app


app = create_app()
