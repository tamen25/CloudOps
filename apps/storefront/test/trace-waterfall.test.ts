import test from "node:test";
import assert from "node:assert/strict";
import { buildWaterfall } from "../src/lib/trace-waterfall";

// Builds a Tempo-shaped OTLP batch for one service with the given spans.
function batch(service: string, spans: Array<Record<string, unknown>>) {
  return {
    resource: { attributes: [{ key: "service.name", value: { stringValue: service } }] },
    scopeSpans: [{ spans }],
  };
}

function span(opts: {
  id: string;
  parent?: string;
  name: string;
  startMs: number;
  durationMs: number;
  error?: boolean;
}) {
  const startNano = String(opts.startMs * 1e6);
  const endNano = String((opts.startMs + opts.durationMs) * 1e6);
  return {
    spanId: opts.id,
    parentSpanId: opts.parent ?? "",
    name: opts.name,
    kind: "SPAN_KIND_SERVER",
    startTimeUnixNano: startNano,
    endTimeUnixNano: endNano,
    status: opts.error ? { code: 2 } : { code: 0 },
  };
}

test("empty / null OTLP yields an empty waterfall", () => {
  assert.deepEqual(buildWaterfall("t", null).spans, []);
  assert.deepEqual(buildWaterfall("t", {}).spans, []);
  assert.deepEqual(buildWaterfall("t", { batches: [] }).spans, []);
});

test("flattens a parent/child chain depth-first with correct depth", () => {
  const otlp = {
    batches: [
      batch("api-gateway", [span({ id: "a", name: "POST /v1/order", startMs: 0, durationMs: 100 })]),
      batch("pricing", [span({ id: "b", parent: "a", name: "quote", startMs: 10, durationMs: 30 })]),
      batch("inventory", [span({ id: "c", parent: "a", name: "reserve", startMs: 45, durationMs: 20 })]),
      batch("ledger", [span({ id: "d", parent: "b", name: "append", startMs: 15, durationMs: 5 })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  // depth-first: a(0) -> b(1) -> d(2) -> c(1)
  assert.deepEqual(
    wf.spans.map((s) => [s.spanId, s.depth]),
    [["a", 0], ["b", 1], ["d", 2], ["c", 1]],
  );
  assert.equal(wf.spans[0].service, "api-gateway");
});

test("offsetMs is relative to the earliest span; total spans the whole trace", () => {
  const otlp = {
    batches: [
      batch("gw", [span({ id: "root", name: "root", startMs: 1000, durationMs: 200 })]),
      batch("svc", [span({ id: "child", parent: "root", name: "child", startMs: 1050, durationMs: 100 })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  assert.equal(wf.spans[0].offsetMs, 0); // root is earliest
  assert.equal(wf.spans[1].offsetMs, 50); // child starts 50ms in
  assert.equal(wf.spans[1].durationMs, 100);
  assert.equal(wf.totalDurationMs, 200); // root end (1200) - earliest (1000)
});

test("orders sibling children by start time", () => {
  const otlp = {
    batches: [
      batch("gw", [span({ id: "r", name: "r", startMs: 0, durationMs: 100 })]),
      batch("a", [span({ id: "late", parent: "r", name: "late", startMs: 60, durationMs: 10 })]),
      batch("b", [span({ id: "early", parent: "r", name: "early", startMs: 5, durationMs: 10 })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  assert.deepEqual(wf.spans.map((s) => s.spanId), ["r", "early", "late"]);
});

test("marks error spans from OTLP status code 2", () => {
  const otlp = {
    batches: [
      batch("gw", [span({ id: "r", name: "r", startMs: 0, durationMs: 50 })]),
      batch("fraud", [span({ id: "f", parent: "r", name: "score", startMs: 10, durationMs: 20, error: true })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  assert.equal(wf.spans.find((s) => s.spanId === "f")?.error, true);
  assert.equal(wf.spans.find((s) => s.spanId === "r")?.error, false);
});

test("orphan spans (parent not in trace) become roots, not dropped", () => {
  const otlp = {
    batches: [
      batch("svc", [span({ id: "orphan", parent: "missing-parent", name: "op", startMs: 0, durationMs: 10 })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  assert.equal(wf.spans.length, 1);
  assert.equal(wf.spans[0].spanId, "orphan");
  assert.equal(wf.spans[0].depth, 0); // promoted to root
});

test("accepts the resourceSpans/instrumentationLibrarySpans alias shape", () => {
  const otlp = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: "service.name", value: { stringValue: "legacy" } }] },
        instrumentationLibrarySpans: [
          { spans: [span({ id: "x", name: "op", startMs: 0, durationMs: 5 })] },
        ],
      },
    ],
  };
  const wf = buildWaterfall("t", otlp);
  assert.equal(wf.spans.length, 1);
  assert.equal(wf.spans[0].service, "legacy");
});

test("missing service.name falls back to 'unknown'", () => {
  const otlp = { batches: [{ resource: {}, scopeSpans: [{ spans: [span({ id: "x", name: "op", startMs: 0, durationMs: 5 })] }] }] };
  const wf = buildWaterfall("t", otlp);
  assert.equal(wf.spans[0].service, "unknown");
});

test("handles a multi-root forest", () => {
  const otlp = {
    batches: [
      batch("a", [span({ id: "root1", name: "r1", startMs: 100, durationMs: 10 })]),
      batch("b", [span({ id: "root2", name: "r2", startMs: 0, durationMs: 10 })]),
    ],
  };
  const wf = buildWaterfall("t", otlp);
  // both are roots; ordered by start, so root2 (earlier) first
  assert.deepEqual(wf.spans.map((s) => s.spanId), ["root2", "root1"]);
  assert.equal(wf.spans.every((s) => s.depth === 0), true);
});
