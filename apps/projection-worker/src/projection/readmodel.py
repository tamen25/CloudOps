"""Read-model projection logic. Pure functions over decoded order events so
they are unit-testable without Kinesis. The worker (poller.py) wires these to
a real Kinesis stream; the read model is an in-memory per-tenant aggregate that
/metrics exposes."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field


@dataclass
class TenantProjection:
    orders: int = 0
    total_cents: int = 0


@dataclass
class ReadModel:
    by_tenant: dict[str, TenantProjection] = field(default_factory=dict)
    processed: int = 0
    skipped: int = 0

    def apply(self, event: dict) -> None:
        """Fold one decoded order event into the read model.

        Expected shape: {"tenantId": str, "type": "order.created",
        "payload": {"total_cents": int}}. Unknown event types are skipped (not
        an error — the stream is shared)."""
        if event.get("type") != "order.created":
            self.skipped += 1
            return
        tenant = str(event.get("tenantId") or "default")
        payload = event.get("payload") or {}
        try:
            total = int(payload.get("total_cents", 0))
        except (TypeError, ValueError):
            total = 0
        proj = self.by_tenant.setdefault(tenant, TenantProjection())
        proj.orders += 1
        proj.total_cents += total
        self.processed += 1


def decode_record(record: dict) -> dict | None:
    """Decode a Kinesis record's 'Data' field into a JSON dict.

    boto3's get_records returns Data as the record's bytes, already decoded;
    a string is base64, as in a Lambda event. Bytes used to be base64-decoded
    a second time, which turned every real record into garbage and counted
    it as skipped. Returns None on malformed data (caller counts it as
    skipped)."""
    data = record.get("Data")
    if data is None:
        return None
    try:
        raw = base64.b64decode(data, validate=True) if isinstance(data, str) else data
        return json.loads(raw)
    except (ValueError, TypeError):
        return None
