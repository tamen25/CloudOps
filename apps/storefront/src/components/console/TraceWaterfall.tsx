"use client";

import { useEffect, useState } from "react";
import { buildWaterfall, type Waterfall } from "@/lib/trace-waterfall";

// In-app span waterfall (#144). Fetches a single trace's OTLP JSON from the BFF
// (/api/observe/traces?id=) and renders the full span tree as a waterfall —
// replacing the old "opens in Grafana Tempo" placeholder. Each row is a service
// span positioned by its offset into the trace and sized by its duration; error
// spans are flagged so a chaos pod-kill (#143) shows the failed hop visually.

interface Props {
  traceId: string;
}

export function TraceWaterfall({ traceId }: Props) {
  const [wf, setWf] = useState<Waterfall | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setWf(null);
    fetch(`/api/observe/traces?id=${encodeURIComponent(traceId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { trace?: unknown }) => {
        if (cancelled) return;
        const built = buildWaterfall(traceId, data.trace ?? null);
        setWf(built);
        setState(built.spans.length === 0 ? "empty" : "ok");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  if (state === "loading") {
    return <p className="mt-4 font-mono text-[11px] text-fg-subtle">loading span tree…</p>;
  }
  if (state === "error") {
    return <p className="mt-4 font-mono text-[11px] text-fg-subtle">trace feed degraded — try again or open in Grafana Tempo</p>;
  }
  if (state === "empty" || !wf) {
    return <p className="mt-4 font-mono text-[11px] text-fg-subtle">no spans found for this trace</p>;
  }

  const total = wf.totalDurationMs || 1;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-border-muted/60">
      <div className="flex items-center justify-between border-b border-border-muted/40 bg-bg-elev/40 px-4 py-2">
        <span className="font-mono text-[11px] text-fg-subtle">
          span waterfall · <span className="text-brand-400">{wf.spans.length}</span> spans ·{" "}
          <span className="text-fg-base">{total.toFixed(0)} ms</span> total
        </span>
        <span className="font-mono text-[11px] text-fg-subtle">{traceId.slice(0, 16)}…</span>
      </div>
      <ul className="divide-y divide-border-muted/30">
        {wf.spans.map((s, i) => {
          const leftPct = (s.offsetMs / total) * 100;
          const widthPct = Math.max(0.5, (s.durationMs / total) * 100);
          return (
            <li key={`${s.spanId}-${i}`} className="grid grid-cols-[minmax(0,18rem)_1fr] items-center gap-3 px-4 py-1.5">
              {/* label column — indented by depth */}
              <div className="flex items-center gap-2 overflow-hidden" style={{ paddingLeft: `${s.depth * 14}px` }}>
                <span
                  className="truncate font-mono text-[12px]"
                  style={{ color: s.error ? "var(--danger)" : "var(--fg-base)" }}
                >
                  {s.service}
                </span>
                <span className="truncate font-mono text-[11px] text-fg-subtle">{s.name}</span>
              </div>
              {/* bar column */}
              <div className="relative h-4">
                <div
                  className="absolute top-0 h-4 rounded-sm"
                  style={{
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    backgroundColor: s.error ? "var(--danger)" : "var(--brand-500)",
                    opacity: s.error ? 0.6 : 0.5,
                  }}
                  title={`${s.service} · ${s.name} · +${s.offsetMs.toFixed(1)}ms · ${s.durationMs.toFixed(1)}ms${s.error ? " · ERROR" : ""}`}
                />
                <span
                  className="absolute top-0 whitespace-nowrap font-mono text-[10px] leading-4 text-fg-subtle"
                  style={{ left: `calc(${Math.min(leftPct + widthPct, 92)}% + 4px)` }}
                >
                  {s.durationMs.toFixed(0)}ms
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
