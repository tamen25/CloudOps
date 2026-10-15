import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmf, handler } from "./index.mjs";

test("buildEmf produces a valid EMF document", () => {
  const doc = buildEmf({ tenantId: "t1", riskTier: "high", totalCents: 500 }, 1700000000000);
  assert.equal(doc.tenantId, "t1");
  assert.equal(doc.riskTier, "high");
  assert.equal(doc.OrdersCount, 1);
  assert.equal(doc.OrderValueCents, 500);
  assert.equal(doc._aws.CloudWatchMetrics[0].Namespace, "CloudOps/Mesh");
  assert.equal(doc._aws.Timestamp, 1700000000000);
});

test("buildEmf returns null on non-object / bad total", () => {
  assert.equal(buildEmf(null), null);
  assert.equal(buildEmf({ tenantId: "t1", totalCents: "NaNish" }), null);
});

test("handler emits one EMF line per detail", async () => {
  const logs = [];
  const orig = console.log;
  console.log = (line) => logs.push(line);
  try {
    const res = await handler({ detail: { tenantId: "t1", riskTier: "low", totalCents: 100 } });
    assert.equal(res.emitted, 1);
    assert.equal(logs.length, 1);
    assert.equal(JSON.parse(logs[0]).tenantId, "t1");
  } finally {
    console.log = orig;
  }
});

test("handler skips unusable details", async () => {
  const orig = console.log;
  console.log = () => {};
  try {
    const res = await handler({ detail: { tenantId: "t1", totalCents: "bad" } });
    assert.equal(res.emitted, 0);
  } finally {
    console.log = orig;
  }
});
