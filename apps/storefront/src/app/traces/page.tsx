"use client";

import { useState } from "react";
import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { usePoll } from "@/components/console/usePoll";
import { TraceWaterfall } from "@/components/console/TraceWaterfall";
import type { TraceSummary } from "@/lib/observe";

export default function TracesPage() {
  const { data, error, loading } = usePoll<{ traces: TraceSummary[] }>("/api/observe/traces?limit=25", 5000);
  const [selected, setSelected] = useState<string | null>(null);
  const traces = data?.traces ?? [];

  return (
    <main className="relative isolate min-h-screen">
      <div className="absolute inset-0 -z-10 line-grid opacity-[0.12]" aria-hidden />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <ConsoleHeader
          active="/traces"
          title="Traces"
          subtitle="Recent traces from Tempo. A single place-order spans the full chain — gateway → pricing → inventory → fraud → payment → ledger — plus the async lambda fan-out."
        />

        <div className="overflow-hidden rounded-lg border border-border-muted/60">
          <table className="w-full font-mono text-sm">
            <thead className="bg-bg-elev/40 text-left text-[11px] uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">trace id</th>
                <th className="px-4 py-3 font-medium">root service</th>
                <th className="px-4 py-3 font-medium">operation</th>
                <th className="px-4 py-3 text-right font-medium">duration</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted/40">
              {traces.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-fg-subtle">
                    {loading ? "loading…" : error ? `feed degraded: ${error}` : "no traces yet — start a run on /load"}
                  </td>
                </tr>
              )}
              {traces.map((t) => (
                <tr
                  key={t.traceId}
                  onClick={() => setSelected(selected === t.traceId ? null : t.traceId)}
                  className={`cursor-pointer bg-bg-base/40 transition-colors hover:bg-bg-elev/30 ${
                    selected === t.traceId ? "bg-brand-500/5" : ""
                  }`}
                >
                  <td className="px-4 py-3 text-brand-400">{t.traceId.slice(0, 16)}…</td>
                  <td className="px-4 py-3 text-fg-base">{t.rootService || "—"}</td>
                  <td className="px-4 py-3 text-fg-muted">{t.rootName || "—"}</td>
                  <td className="px-4 py-3 text-right text-fg-base">{t.durationMs.toFixed(0)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {selected && <TraceWaterfall traceId={selected} />}
      </div>
    </main>
  );
}
