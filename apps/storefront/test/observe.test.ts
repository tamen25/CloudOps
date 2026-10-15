import test from "node:test";
import assert from "node:assert/strict";
import {
  parseServiceGraph,
  parseServiceMetrics,
  parseTraceSearch,
} from "../src/lib/observe";

test("parseServiceGraph builds nodes + edges and merges error rates", () => {
  const total = [
    { metric: { client: "api-gateway", server: "pricing" }, value: [0, "5"] as [number, string] },
    { metric: { client: "api-gateway", server: "inventory" }, value: [0, "4"] as [number, string] },
  ];
  const failed = [
    { metric: { client: "api-gateway", server: "pricing" }, value: [0, "0.5"] as [number, string] },
  ];
  const topo = parseServiceGraph(total, failed);
  assert.deepEqual(topo.nodes, ["api-gateway", "inventory", "pricing"]);
  const pricingEdge = topo.edges.find((e) => e.target === "pricing");
  assert.equal(pricingEdge?.callRate, 5);
  assert.equal(pricingEdge?.errorRate, 0.5);
  const invEdge = topo.edges.find((e) => e.target === "inventory");
  assert.equal(invEdge?.errorRate, 0);
});

test("parseServiceMetrics keys by server label", () => {
  const series = [
    { metric: { server: "fraud" }, value: [0, "2.5"] as [number, string] },
  ];
  const m = parseServiceMetrics(series, "rps");
  assert.equal(m.get("fraud")?.rps, 2.5);
});

test("parseTraceSearch reshapes Tempo search results", () => {
  const traces = [
    {
      traceID: "abc123",
      rootServiceName: "api-gateway",
      rootTraceName: "POST /v1/order",
      durationMs: 120,
      startTimeUnixNano: 1_700_000_000_000_000_000,
    },
  ];
  const out = parseTraceSearch(traces);
  assert.equal(out.length, 1);
  assert.equal(out[0].traceId, "abc123");
  assert.equal(out[0].rootService, "api-gateway");
  assert.equal(out[0].durationMs, 120);
  assert.equal(out[0].startTimeUnixMs, 1_700_000_000_000);
});

test("parseServiceGraph handles empty input", () => {
  const topo = parseServiceGraph([], []);
  assert.deepEqual(topo.nodes, []);
  assert.deepEqual(topo.edges, []);
});
