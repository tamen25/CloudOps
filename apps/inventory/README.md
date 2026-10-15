# inventory (Python / FastAPI)

Mesh service. One job: reserve stock for a set of line items (all-or-nothing).

- `POST /reserve` `{ "items": [{ "sku": "A", "qty": 2 }] }` →
  `{ "reserved": bool, "lines": [...] }`
- `GET /healthz`, `GET /readyz`, `GET /metrics`

Stock is an in-memory seed for the dev/test tier (`SEED_STOCK` env, JSON map).
OTel auto-instruments FastAPI when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; no-ops
otherwise.

## Dev

```bash
python -m venv .venv && . .venv/Scripts/activate   # or bin/activate on *nix
pip install -e ".[test]"
pytest
uvicorn inventory.app:app --port 8080
```
