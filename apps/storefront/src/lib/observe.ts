// Observability BFF client. Queries the in-cluster Tempo / Mimir / Loki HTTP
// APIs server-side and reshapes responses for the console. No credentials ever
// reach the browser — these helpers run only in route handlers (server).
//
// The pure builders (parseServiceGraph, etc.) are exported so they can be unit
// tested without a live backend; the fetchers are thin wrappers.

const TEMPO_URL = () => process.env.TEMPO_URL || "";
const MIMIR_URL = () => process.env.MIMIR_URL || "";
const LOKI_URL = () => process.env.LOKI_URL || "";

const FETCH_TIMEOUT_MS = 4000;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`upstream ${res.status}`);
  return res.json();
}

// ─── Service-graph topology (Mimir-stored service-graph metrics) ─────────────
// Tempo's metrics-generator writes `traces_service_graph_request_total` into
// Mimir with client/server labels. We turn that into nodes + edges.
export interface TopologyEdge {
  source: string;
  target: string;
  callRate: number;
  errorRate: number;
}
export interface Topology {
  nodes: string[];
  edges: TopologyEdge[];
}

export function parseServiceGraph(
  totalSeries: Array<{ metric: Record<string, string>; value: [number, string] }>,
  failedSeries: Array<{ metric: Record<string, string>; value: [number, string] }>,
): Topology {
  const edges = new Map<string, TopologyEdge>();
  const nodes = new Set<string>();

  for (const s of totalSeries) {
    const source = s.metric.client ?? "unknown";
    const target = s.metric.server ?? "unknown";
    nodes.add(source);
    nodes.add(target);
    const key = `${source}->${target}`;
    edges.set(key, { source, target, callRate: Number(s.value[1]) || 0, errorRate: 0 });
  }
  for (const s of failedSeries) {
    const key = `${s.metric.client ?? "unknown"}->${s.metric.server ?? "unknown"}`;
    const edge = edges.get(key);
    if (edge) edge.errorRate = Number(s.value[1]) || 0;
  }

  return { nodes: [...nodes].sort(), edges: [...edges.values()] };
}

function promInstant(query: string): string {
  return `${MIMIR_URL()}/prometheus/api/v1/query?query=${encodeURIComponent(query)}`;
}

export async function fetchTopology(): Promise<Topology> {
  if (!MIMIR_URL()) return { nodes: [], edges: [] };
  const total = (await getJson(
    promInstant("sum by (client, server) (rate(traces_service_graph_request_total[1m]))"),
  )) as { data?: { result?: Parameters<typeof parseServiceGraph>[0] } };
  const failed = (await getJson(
    promInstant("sum by (client, server) (rate(traces_service_graph_request_failed_total[1m]))"),
  )) as { data?: { result?: Parameters<typeof parseServiceGraph>[1] } };
  return parseServiceGraph(total.data?.result ?? [], failed.data?.result ?? []);
}

// ─── Per-service metrics (rps / p95 / error rate) ────────────────────────────
export interface ServiceMetric {
  service: string;
  rps: number;
  errorRate: number;
}

export function parseServiceMetrics(
  series: Array<{ metric: Record<string, string>; value: [number, string] }>,
  key: "rps" | "errorRate",
): Map<string, Partial<ServiceMetric>> {
  const out = new Map<string, Partial<ServiceMetric>>();
  for (const s of series) {
    const svc = s.metric.service ?? s.metric.server ?? "unknown";
    const cur = out.get(svc) ?? { service: svc };
    cur[key] = Number(s.value[1]) || 0;
    out.set(svc, cur);
  }
  return out;
}

export async function fetchServiceMetrics(): Promise<ServiceMetric[]> {
  if (!MIMIR_URL()) return [];
  const rps = (await getJson(
    promInstant("sum by (server) (rate(traces_service_graph_request_total[1m]))"),
  )) as { data?: { result?: Parameters<typeof parseServiceMetrics>[0] } };
  const errs = (await getJson(
    promInstant("sum by (server) (rate(traces_service_graph_request_failed_total[1m]))"),
  )) as { data?: { result?: Parameters<typeof parseServiceMetrics>[0] } };

  const rpsMap = parseServiceMetrics(rps.data?.result ?? [], "rps");
  const errMap = parseServiceMetrics(errs.data?.result ?? [], "errorRate");
  const services = new Set([...rpsMap.keys(), ...errMap.keys()]);
  return [...services].map((svc) => ({
    service: svc,
    rps: rpsMap.get(svc)?.rps ?? 0,
    errorRate: errMap.get(svc)?.errorRate ?? 0,
  }));
}

// ─── Recent traces (Tempo search) ────────────────────────────────────────────
export interface TraceSummary {
  traceId: string;
  rootService: string;
  rootName: string;
  durationMs: number;
  startTimeUnixMs: number;
}

export function parseTraceSearch(
  traces: Array<Record<string, unknown>>,
): TraceSummary[] {
  return traces.map((t) => ({
    traceId: String(t.traceID ?? ""),
    rootService: String(t.rootServiceName ?? ""),
    rootName: String(t.rootTraceName ?? ""),
    durationMs: Number(t.durationMs ?? 0),
    startTimeUnixMs: Number(t.startTimeUnixNano ?? 0) / 1e6,
  }));
}

export async function fetchRecentTraces(limit = 20): Promise<TraceSummary[]> {
  if (!TEMPO_URL()) return [];
  const url = `${TEMPO_URL()}/api/search?limit=${Math.min(Math.max(limit, 1), 50)}`;
  const data = (await getJson(url)) as { traces?: Array<Record<string, unknown>> };
  return parseTraceSearch(data.traces ?? []);
}

export async function fetchTraceById(traceId: string): Promise<unknown> {
  if (!TEMPO_URL()) return null;
  // Tempo returns OTLP JSON for a single trace.
  return getJson(`${TEMPO_URL()}/api/traces/${encodeURIComponent(traceId)}`);
}

export const _internal = { LOKI_URL };
