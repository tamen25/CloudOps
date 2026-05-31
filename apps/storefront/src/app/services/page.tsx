"use client";

import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { usePoll } from "@/components/console/usePoll";
import type { ServiceMetric } from "@/lib/observe";

// Static language/role map for the known mesh services — purely cosmetic
// labelling next to the live rps/error data.
const META: Record<string, { lang: string; role: string }> = {
  "api-gateway": { lang: "node", role: "edge / trace root" },
  pricing: { lang: "go", role: "price quote" },
  inventory: { lang: "python", role: "stock reserve" },
  fraud: { lang: "java", role: "risk score" },
  payment: { lang: "node", role: "authorize" },
  ledger: { lang: "go", role: "double-entry" },
  "projection-worker": { lang: "python", role: "read model" },
  loadgen: { lang: "node", role: "traffic gen" },
};

export default function ServicesPage() {
  const { data, error, loading } = usePoll<{ services: ServiceMetric[] }>("/api/observe/metrics", 4000);
  const services = (data?.services ?? []).slice().sort((a, b) => a.service.localeCompare(b.service));

  return (
    <main className="relative isolate min-h-screen">
      <div className="absolute inset-0 -z-10 line-grid opacity-[0.12]" aria-hidden />
      <div className="mx-auto max-w-5xl px-6 py-16">
        <ConsoleHeader
          active="/services"
          title="Services"
          subtitle="Per-service throughput and error rate, derived from the service-graph metrics. One row per node in the mesh."
        />

        <div className="overflow-hidden rounded-lg border border-border-muted/60">
          <table className="w-full font-mono text-sm">
            <thead className="bg-bg-elev/40 text-left text-[11px] uppercase tracking-wider text-fg-subtle">
              <tr>
                <th className="px-4 py-3 font-medium">service</th>
                <th className="px-4 py-3 font-medium">lang</th>
                <th className="px-4 py-3 font-medium">role</th>
                <th className="px-4 py-3 text-right font-medium">rps</th>
                <th className="px-4 py-3 text-right font-medium">err/s</th>
                <th className="px-4 py-3 font-medium">state</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted/40">
              {services.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-fg-subtle">
                    {loading ? "loading…" : error ? `feed degraded: ${error}` : "no service traffic yet — start a run on /load"}
                  </td>
                </tr>
              )}
              {services.map((s) => {
                const meta = META[s.service] ?? { lang: "—", role: "—" };
                const errored = s.errorRate > 0;
                return (
                  <tr key={s.service} className="bg-bg-base/40 transition-colors hover:bg-bg-elev/30">
                    <td className="px-4 py-3 text-fg-base">{s.service}</td>
                    <td className="px-4 py-3 text-fg-muted">{meta.lang}</td>
                    <td className="px-4 py-3 text-fg-subtle">{meta.role}</td>
                    <td className="px-4 py-3 text-right text-fg-base">{s.rps.toFixed(2)}</td>
                    <td className={`px-4 py-3 text-right ${errored ? "text-danger" : "text-fg-subtle"}`}>{s.errorRate.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-xs ${errored ? "text-warning" : "text-success"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${errored ? "bg-warning" : "bg-success"}`} />
                        {errored ? "degraded" : "healthy"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
