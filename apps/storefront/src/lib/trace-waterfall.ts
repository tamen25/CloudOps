// Parses Tempo's single-trace OTLP JSON into a flat, ordered list of spans ready
// for a waterfall render — backlog #144. Pure (no React, no fetch) so it is unit
// tested directly. Tempo returns either { batches: [...] } or
// { resourceSpans: [...] }; both are ResourceSpans arrays with the same shape:
//   ResourceSpans -> resource.attributes[] + scopeSpans[] (a.k.a. instrumentationLibrarySpans) -> spans[]
// Each span has traceId, spanId, parentSpanId, name, kind, start/endTimeUnixNano,
// status, and attributes. We fold these into a tree, then flatten depth-first so
// the UI can render rows with an indentation depth and a relative time offset.

export interface WaterfallSpan {
  spanId: string;
  parentSpanId: string;
  name: string;
  service: string;
  depth: number; // indentation level in the flattened tree
  startMs: number; // absolute start, ms (for sorting)
  offsetMs: number; // start relative to the trace's earliest span
  durationMs: number;
  error: boolean;
  kind: string;
}

export interface Waterfall {
  traceId: string;
  totalDurationMs: number;
  spans: WaterfallSpan[]; // depth-first ordered
}

interface RawSpan {
  spanId: string;
  parentSpanId: string;
  name: string;
  service: string;
  startMs: number;
  durationMs: number;
  error: boolean;
  kind: string;
}

// OTLP attribute values are tagged unions ({ stringValue }, { intValue }, …).
// We only need service.name as a string, so pull the string form.
function attrString(attrs: unknown, key: string): string {
  if (!Array.isArray(attrs)) return "";
  for (const a of attrs as Array<Record<string, unknown>>) {
    if (a?.key === key) {
      const v = a?.value as Record<string, unknown> | undefined;
      if (v && typeof v.stringValue === "string") return v.stringValue;
    }
  }
  return "";
}

// OTLP nanos come as a string or number; normalise to ms.
function nanoToMs(n: unknown): number {
  const num = typeof n === "string" ? Number(n) : typeof n === "number" ? n : 0;
  return Number.isFinite(num) ? num / 1e6 : 0;
}

function isError(status: unknown): boolean {
  // OTLP status code 2 = ERROR (0 UNSET, 1 OK).
  const code = (status as Record<string, unknown> | undefined)?.code;
  return code === 2 || code === "STATUS_CODE_ERROR";
}

function extractRawSpans(otlp: unknown): RawSpan[] {
  const root = otlp as Record<string, unknown> | null;
  if (!root) return [];
  // Accept both { batches } (Tempo) and { resourceSpans } (raw OTLP export).
  const resourceSpans =
    (root.batches as unknown[]) ?? (root.resourceSpans as unknown[]) ?? [];
  if (!Array.isArray(resourceSpans)) return [];

  const out: RawSpan[] = [];
  for (const rs of resourceSpans as Array<Record<string, unknown>>) {
    const resource = rs?.resource as Record<string, unknown> | undefined;
    const service = attrString(resource?.attributes, "service.name") || "unknown";
    const scopeSpans =
      (rs?.scopeSpans as unknown[]) ?? (rs?.instrumentationLibrarySpans as unknown[]) ?? [];
    if (!Array.isArray(scopeSpans)) continue;
    for (const ss of scopeSpans as Array<Record<string, unknown>>) {
      const spans = ss?.spans;
      if (!Array.isArray(spans)) continue;
      for (const s of spans as Array<Record<string, unknown>>) {
        const startMs = nanoToMs(s.startTimeUnixNano);
        const endMs = nanoToMs(s.endTimeUnixNano);
        out.push({
          spanId: String(s.spanId ?? ""),
          parentSpanId: String(s.parentSpanId ?? ""),
          name: String(s.name ?? ""),
          service,
          startMs,
          durationMs: Math.max(0, endMs - startMs),
          error: isError(s.status),
          kind: String(s.kind ?? ""),
        });
      }
    }
  }
  return out;
}

// buildWaterfall folds raw spans into a parent→children tree and flattens it
// depth-first. Orphan spans (parent not in the trace) and forests with multiple
// roots are handled: every span with no in-trace parent is treated as a root.
// Children at each level are ordered by start time.
export function buildWaterfall(traceId: string, otlp: unknown): Waterfall {
  const raw = extractRawSpans(otlp);
  if (raw.length === 0) {
    return { traceId, totalDurationMs: 0, spans: [] };
  }

  const byId = new Map<string, RawSpan>();
  for (const s of raw) byId.set(s.spanId, s);

  const childrenOf = new Map<string, RawSpan[]>();
  const roots: RawSpan[] = [];
  for (const s of raw) {
    const hasParent = s.parentSpanId && byId.has(s.parentSpanId);
    if (hasParent) {
      const list = childrenOf.get(s.parentSpanId) ?? [];
      list.push(s);
      childrenOf.set(s.parentSpanId, list);
    } else {
      roots.push(s);
    }
  }

  const earliestMs = Math.min(...raw.map((s) => s.startMs));
  const latestEndMs = Math.max(...raw.map((s) => s.startMs + s.durationMs));
  const totalDurationMs = Math.max(0, latestEndMs - earliestMs);

  const ordered: WaterfallSpan[] = [];
  const byStart = (a: RawSpan, b: RawSpan) => a.startMs - b.startMs;

  const walk = (span: RawSpan, depth: number): void => {
    ordered.push({
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      service: span.service,
      depth,
      startMs: span.startMs,
      offsetMs: span.startMs - earliestMs,
      durationMs: span.durationMs,
      error: span.error,
      kind: span.kind,
    });
    const kids = (childrenOf.get(span.spanId) ?? []).slice().sort(byStart);
    for (const k of kids) walk(k, depth + 1);
  };

  for (const r of roots.slice().sort(byStart)) walk(r, 0);

  return { traceId, totalDurationMs, spans: ordered };
}
