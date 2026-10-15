# projection-worker (Python)

Long-running Kinesis consumer. Reads the order-event stream (the
storefront-events stream, reused as the mesh event backbone), folds
`order.created` events into a per-tenant read model, and exposes it on
`/metrics`. Health/readiness on `/healthz` `/readyz`.

Not request-routed — the read model is the queryable artifact (via metrics).

## Env
- `KINESIS_STREAM_NAME` — stream to consume. Empty = idle (health only).
- `AWS_REGION`, `POLL_INTERVAL_SECONDS` (default 2), `PORT` (default 8080).
- `OTEL_EXPORTER_OTLP_ENDPOINT` — enables botocore auto-instrumentation.

## Dev
```bash
python -m venv .venv && . .venv/Scripts/activate
pip install -e ".[test]"
pytest
```
