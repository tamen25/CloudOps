"use client";

import type { ServiceMetric } from "@/lib/observe";

// Headline metrics computed from the per-service feed: total rps across the
// mesh, aggregate error rate, and live service count.
export function MetricStrip({ services }: { services: ServiceMetric[] }) {
  const totalRps = services.reduce((s, m) => s + m.rps, 0);
  const totalErr = services.reduce((s, m) => s + m.errorRate, 0);
  const errPct = totalRps > 0 ? (totalErr / totalRps) * 100 : 0;

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border-muted/60 bg-border-muted/40 sm:grid-cols-4">
      <Metric label="services live" value={String(services.length)} tone="brand" />
      <Metric label="mesh throughput" value={`${totalRps.toFixed(1)}/s`} tone="base" />
      <Metric label="error rate" value={`${errPct.toFixed(2)}%`} tone={errPct >= 5 ? "danger" : errPct >= 1 ? "warning" : "success"} />
      <Metric label="busiest" value={busiest(services)} tone="base" mono />
    </dl>
  );
}

function busiest(services: ServiceMetric[]): string {
  if (services.length === 0) return "—";
  return [...services].sort((a, b) => b.rps - a.rps)[0].service;
}

function Metric({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: string;
  tone: "brand" | "base" | "success" | "warning" | "danger";
  mono?: boolean;
}) {
  const toneClass = {
    brand: "text-brand-400",
    base: "text-fg-base",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
  }[tone];
  return (
    <div className="bg-bg-base px-4 py-3">
      <dt className="text-[10px] uppercase tracking-widest text-fg-subtle">{label}</dt>
      <dd className={`mt-1 ${mono ? "font-mono text-sm" : "font-mono text-2xl"} ${toneClass}`}>{value}</dd>
    </div>
  );
}
