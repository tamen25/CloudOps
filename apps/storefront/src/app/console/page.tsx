"use client";

import { ConsoleHeader } from "@/components/console/ConsoleHeader";
import { ServiceMap } from "@/components/console/ServiceMap";
import { MetricStrip } from "@/components/console/MetricStrip";
import { usePoll } from "@/components/console/usePoll";
import type { Topology, ServiceMetric } from "@/lib/observe";

export default function ConsolePage() {
  const topo = usePoll<Topology>("/api/observe/topology", 4000);
  const metrics = usePoll<{ services: ServiceMetric[] }>("/api/observe/metrics", 4000);

  const topology: Topology = topo.data ?? { nodes: [], edges: [] };
  const services = metrics.data?.services ?? [];

  return (
    <main className="relative isolate min-h-screen">
      <div className="absolute inset-0 -z-10 line-grid opacity-[0.12]" aria-hidden />
      <div className="mx-auto max-w-6xl px-6 py-16">
        <ConsoleHeader
          active="/console"
          title="Service map"
          subtitle="Live topology from the Tempo metrics-generator. Every node is a real service; every edge is a real call. Synthetic traffic from /load lights it up."
        />

        <div className="mb-6">
          <MetricStrip services={services} />
        </div>

        <ServiceMap topology={topology} />

        <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-fg-subtle">
          <span className={`h-1.5 w-1.5 rounded-full ${topo.error ? "bg-danger" : "bg-brand-500 animate-pulse"}`} />
          {topo.error
            ? `topology feed degraded: ${topo.error}`
            : topo.loading
              ? "connecting to Tempo…"
              : `${topology.edges.length} edges · refreshing every 4s`}
        </p>
      </div>
    </main>
  );
}
