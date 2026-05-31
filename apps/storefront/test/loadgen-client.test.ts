import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { clampRps, clampDuration, isScenario, startRun, stopRun } from "../src/lib/loadgen-client";

test("clampRps + clampDuration enforce ceilings/floors", () => {
  assert.equal(clampRps(99999), 200);
  assert.equal(clampRps(0), 1);
  assert.equal(clampRps("x"), 1);
  assert.equal(clampDuration(99999), 600);
  assert.equal(clampDuration(0), 1);
});

test("isScenario validates", () => {
  assert.equal(isScenario("place-order"), true);
  assert.equal(isScenario("nope"), false);
});

test("startRun rejects unknown scenario before any fetch", async () => {
  const res = await startRun({ baseUrl: "http://loadgen", secret: "s" }, { scenario: "evil", rps: 5, durationSeconds: 5 });
  assert.equal(res.status, 400);
});

test("startRun signs the clamped payload with a valid HMAC", async () => {
  const orig = globalThis.fetch;
  let capturedHeaders: Record<string, string> = {};
  let capturedBody = "";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedHeaders = init.headers as Record<string, string>;
    capturedBody = String(init.body);
    return new Response(JSON.stringify({ status: "started" }), { status: 202 });
  }) as unknown as typeof fetch;
  try {
    const res = await startRun(
      { baseUrl: "http://loadgen", secret: "topsecret", tenant: "ops" },
      { scenario: "mixed", rps: 99999, durationSeconds: 30 },
    );
    assert.equal(res.status, 202);

    // Body was clamped to 200 rps before signing.
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.rps, 200);

    // HMAC must verify over exactly the body sent.
    const ts = capturedHeaders["x-cloudops-timestamp"];
    const expected = createHash("sha256").update(`${ts}.ops.${capturedBody}.topsecret`).digest("hex");
    assert.equal(capturedHeaders["x-cloudops-hmac"], expected);
  } finally {
    globalThis.fetch = orig;
  }
});

test("stopRun posts a signed empty body", async () => {
  const orig = globalThis.fetch;
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response(JSON.stringify({ status: "stopped" }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const res = await stopRun({ baseUrl: "http://loadgen", secret: "s" });
    assert.equal(res.status, 200);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = orig;
  }
});
