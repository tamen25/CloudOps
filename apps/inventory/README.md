# inventory (Python / FastAPI)

Mesh service. One job: check stock for a set of line items (all-or-nothing).

`/reserve` checks availability; it does not hold stock. Nothing is
decremented, and nothing is released when a later hop (fraud, payment)
fails. That is deliberate: the service exists to make the order trace
deep, and the stock is an in-memory seed. A scenario that reasons about
stock levels needs a real reservation (decrement on reserve, release on
failure) first.

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
