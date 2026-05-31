"""FastAPI HTTP layer for the inventory service. Thin wrapper over core.reserve.

Stock is an in-memory seed (dev/test tier). SEED_STOCK is an optional JSON map
of sku -> qty; unknown SKUs default to a flat fallback so synthetic traffic
always exercises both the ok and short-stock branches."""

from __future__ import annotations

import json
import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

from inventory.core import InvalidReservation, ReserveLine, reserve
from inventory.tracing import init_tracer, instrument_app

RESERVE_TOTAL = Counter("inventory_reserve_total", "Reserve requests", ["reserved"])

# Default seed: every SKU reports 100 in stock unless SEED_STOCK overrides it.
DEFAULT_STOCK = 100


def _load_stock() -> dict[str, int]:
    raw = os.environ.get("SEED_STOCK", "")
    if not raw:
        return {}
    try:
        return {str(k): int(v) for k, v in json.loads(raw).items()}
    except (ValueError, TypeError):
        return {}


def create_app() -> FastAPI:
    init_tracer("inventory")
    app = FastAPI(title="inventory", docs_url=None, redoc_url=None, openapi_url=None)
    seed = _load_stock()

    @app.get("/healthz")
    def healthz():
        return {"status": "ok"}

    @app.get("/readyz")
    def readyz():
        return {"status": "ready"}

    @app.get("/metrics")
    def metrics():
        return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

    @app.post("/reserve")
    async def reserve_endpoint(payload: dict):
        items = payload.get("items", [])
        try:
            lines = [ReserveLine(sku=str(i["sku"]), qty=int(i["qty"])) for i in items]
        except (KeyError, TypeError, ValueError):
            return JSONResponse({"error": "invalid_items"}, status_code=400)

        # Resolve stock: explicit seed value, else the flat default so the
        # service is usable without configuration in dev.
        stock = {line.sku: seed.get(line.sku, DEFAULT_STOCK) for line in lines}
        try:
            result = reserve(lines, stock)
        except InvalidReservation as exc:
            return JSONResponse({"error": str(exc)}, status_code=400)

        RESERVE_TOTAL.labels(reserved=str(result.reserved).lower()).inc()
        return {"reserved": result.reserved, "lines": result.lines}

    instrument_app(app)
    return app


app = create_app()
