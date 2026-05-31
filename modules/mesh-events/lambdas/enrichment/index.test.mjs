import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeRecord, enrich, handler } from "./index.mjs";

function kinesisRecord(obj) {
  return { kinesis: { data: Buffer.from(JSON.stringify(obj)).toString("base64") } };
}

test("decodeRecord parses a base64 JSON Kinesis record", () => {
  const obj = { tenantId: "t1", type: "order.created", payload: { total_cents: 500 } };
  assert.deepEqual(decodeRecord(kinesisRecord(obj)), obj);
});

test("decodeRecord returns null on malformed data", () => {
  assert.equal(decodeRecord({ kinesis: { data: "%%%not-json%%%" } }), null);
  assert.equal(decodeRecord({}), null);
});

test("enrich derives risk tiers from total", () => {
  assert.equal(enrich({ payload: { total_cents: 50 } }).riskTier, "low");
  assert.equal(enrich({ payload: { total_cents: 100000 } }).riskTier, "medium");
  assert.equal(enrich({ payload: { total_cents: 500000 } }).riskTier, "high");
});

test("enrich flags synthetic tenants", () => {
  assert.equal(enrich({ tenantId: "synthetic-3" }).synthetic, true);
  assert.equal(enrich({ tenantId: "t1" }).synthetic, false);
});

test("handler counts enriched + skipped without a bus configured", async () => {
  // EVENT_BUS_NAME unset in test → no EventBridge client, entries not sent but
  // still counted.
  const res = await handler({
    Records: [
      kinesisRecord({ tenantId: "t1", type: "order.created", payload: { total_cents: 200 } }),
      { kinesis: { data: "garbage" } },
    ],
  });
  assert.equal(res.enriched, 1);
  assert.equal(res.skipped, 1);
});
