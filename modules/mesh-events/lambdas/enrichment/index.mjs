// enrichment-lambda — Kinesis-triggered. Decodes order events, enriches them
// with a derived risk tier + a normalized shape, and puts them on the mesh
// EventBridge bus. Pure transform functions are exported for unit testing; the
// handler wires them to Kinesis records + the EventBridge client.
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

const BUS_NAME = process.env.EVENT_BUS_NAME || "";
const SOURCE = "cloudops.mesh.enrichment";

const eb = BUS_NAME ? new EventBridgeClient({}) : null;

// decodeRecord turns a Kinesis record into the order event object, or null if
// the payload is not JSON (shared stream — foreign records are skipped).
export function decodeRecord(record) {
  const b64 = record?.kinesis?.data;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

// enrich derives a coarse risk tier from the order total and stamps a
// normalized event ready for downstream consumers.
export function enrich(event) {
  const total = Number(event?.payload?.total_cents ?? 0);
  let tier = "low";
  if (total >= 500000) tier = "high";
  else if (total >= 100000) tier = "medium";

  return {
    tenantId: String(event?.tenantId ?? "default"),
    orderId: String(event?.orderId ?? ""),
    type: String(event?.type ?? "order.created"),
    totalCents: total,
    riskTier: tier,
    synthetic: Boolean(event?.synthetic) || String(event?.tenantId ?? "").startsWith("synthetic-"),
    enrichedAt: new Date().toISOString(),
  };
}

export const handler = async (kinesisEvent) => {
  const records = kinesisEvent?.Records ?? [];
  const entries = [];
  let skipped = 0;

  for (const record of records) {
    const decoded = decodeRecord(record);
    if (!decoded) {
      skipped += 1;
      continue;
    }
    const enriched = enrich(decoded);
    entries.push({
      EventBusName: BUS_NAME,
      Source: SOURCE,
      DetailType: enriched.type,
      Detail: JSON.stringify(enriched),
    });
  }

  if (eb && entries.length > 0) {
    // PutEvents caps at 10 entries per call.
    for (let i = 0; i < entries.length; i += 10) {
      await eb.send(new PutEventsCommand({ Entries: entries.slice(i, i + 10) }));
    }
  }

  return { enriched: entries.length, skipped };
};
