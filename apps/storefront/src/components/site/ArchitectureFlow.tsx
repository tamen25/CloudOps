"use client";

import { Fragment, useState } from "react";
import Link from "next/link";

type Category =
  | "compute"
  | "database"
  | "networking"
  | "security"
  | "integration"
  | "analytics";

interface Step {
  name: string;
  cat: Category;
  desc: string;
  primary?: boolean;
}

interface Flow {
  id: string;
  label: string;
  accent: string;
  note: string;
  steps: Step[];
}

const CAT_COLORS: Record<Category, string> = {
  compute: "#ed7100",
  database: "#3b48cc",
  networking: "#8c4fff",
  security: "#dd344c",
  integration: "#e7157b",
  analytics: "#5a4fcf",
};

const FLOWS: Flow[] = [
  {
    id: "page-load",
    label: "Page load",
    accent: "#539bf5",
    note: "SSR · ALB → Next.js pod · 60ms p95",
    steps: [
      { name: "CloudFront", cat: "networking", desc: "edge cache" },
      { name: "ALB + WAF", cat: "security", desc: "5 rules · TLS 1.3" },
      {
        name: "EKS · storefront",
        cat: "compute",
        desc: "Next.js SSR · HPA 2–12",
        primary: true,
      },
      { name: "Cognito", cat: "security", desc: "JWKS verify" },
      { name: "S3 + CF", cat: "integration", desc: "static assets" },
      { name: "RDS · Postgres", cat: "database", desc: "tenant_id RLS" },
    ],
  },
  {
    id: "search-read",
    label: "Search read",
    accent: CAT_COLORS.compute,
    note: "API Gateway → Lambda + LRU → Express → Postgres FTS · warm <100ms",
    steps: [
      { name: "Browser fetch", cat: "networking", desc: "POST /search" },
      { name: "API Gateway", cat: "networking", desc: "JWT authoriser" },
      {
        name: "search-gateway λ",
        cat: "compute",
        desc: "LRU 60s + HMAC",
        primary: true,
      },
      { name: "Express", cat: "compute", desc: "/_internal/search" },
      { name: "Postgres · tsvector", cat: "database", desc: "GIN · trigram" },
    ],
  },
  {
    id: "order-realtime",
    label: "Order + realtime",
    accent: CAT_COLORS.integration,
    note: "Express POST → Kinesis → ws-fanout λ → API GW WS · push, never poll",
    steps: [
      { name: "Express POST", cat: "compute", desc: "POST /order" },
      { name: "Postgres INSERT", cat: "database", desc: "RLS-bound write" },
      {
        name: "Kinesis",
        cat: "integration",
        desc: "4 shards · 24h",
        primary: true,
      },
      { name: "ws-fanout λ", cat: "compute", desc: "route by tenant" },
      { name: "API GW WS", cat: "networking", desc: "broadcast" },
      { name: "Browser WS", cat: "networking", desc: "reconnect ≤30s" },
    ],
  },
  {
    id: "checkout-saga",
    label: "Checkout saga",
    accent: CAT_COLORS.analytics,
    note: "Step Functions Standard · idempotent · compensate on failure",
    steps: [
      { name: "Express /checkout", cat: "compute", desc: "Idempotency-Key" },
      {
        name: "Step Functions",
        cat: "analytics",
        desc: "Standard SM · 99.0% SLO",
        primary: true,
      },
      { name: "CreateOrder λ", cat: "compute", desc: "pg INSERT" },
      { name: "SQS · email", cat: "integration", desc: "durable buffer" },
      { name: "DeliverEmail λ", cat: "compute", desc: "SES + retry" },
      { name: "Audit · CW", cat: "analytics", desc: "execution log" },
    ],
  },
];

interface ServiceTileProps {
  step: Step;
}

function ServiceTile({ step }: ServiceTileProps) {
  const c = CAT_COLORS[step.cat];
  return (
    <div
      className="flex min-w-[140px] flex-1 flex-col gap-1 rounded-lg border bg-bg-raised/70 px-3.5 py-3 transition-all duration-200"
      style={{
        borderColor: step.primary ? "rgba(94,234,212,0.45)" : undefined,
        borderTopColor: c,
        borderTopWidth: 2,
        background: step.primary ? "rgba(45,212,191,0.06)" : undefined,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="block h-2 w-2 shrink-0 rounded-sm"
          style={{
            backgroundColor: c,
            boxShadow: step.primary ? `0 0 8px ${c}` : undefined,
          }}
        />
        <span className="truncate font-mono text-[12px] text-fg-base">
          {step.name}
        </span>
      </div>
      <span className="truncate font-mono text-[10.5px] text-fg-subtle">
        {step.desc}
      </span>
    </div>
  );
}

interface FlowTrackProps {
  accent: string;
  steps: number;
  active: boolean;
  seed: number;
}

function FlowTrack({ accent, steps, active, seed }: FlowTrackProps) {
  const stops = Math.max(2, steps);
  return (
    <div
      aria-hidden
      data-motion="packet"
      className="relative mt-3 h-[22px] transition-opacity duration-300"
      style={{ opacity: active ? 1 : 0.4 }}
    >
      <div
        className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent} 8%, ${accent} 92%, transparent)`,
          opacity: 0.35,
          boxShadow: `0 0 8px ${accent}`,
        }}
      />
      <div className="absolute inset-x-2 inset-y-0 flex items-center justify-between">
        {Array.from({ length: stops }).map((_, i) => (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full"
            style={{
              backgroundColor: accent,
              opacity: 0.55,
              boxShadow: `0 0 6px ${accent}`,
            }}
          />
        ))}
      </div>
      <span
        className="flow-packet absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 9,
          height: 9,
          backgroundColor: accent,
          boxShadow: `0 0 14px ${accent}, 0 0 4px ${accent}`,
          animation: "flow-move 4.2s linear infinite",
          animationDelay: `${(seed * -0.9).toFixed(2)}s`,
        }}
      />
      <span
        className="flow-packet absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 6,
          height: 6,
          backgroundColor: "#5eead4",
          boxShadow: "0 0 10px #5eead4",
          animation: "flow-move 4.2s linear infinite",
          animationDelay: `${(seed * -0.9 - 2.1).toFixed(2)}s`,
          opacity: 0.85,
        }}
      />
    </div>
  );
}

interface FlowRowProps {
  flow: Flow;
  idx: number;
  hoveredIdx: number;
  onEnter: (idx: number) => void;
  onLeave: () => void;
}

function FlowRow({ flow, idx, hoveredIdx, onEnter, onLeave }: FlowRowProps) {
  const dimmed = hoveredIdx !== -1 && hoveredIdx !== idx;
  const isLast = idx === FLOWS.length - 1;
  return (
    <div
      id={`flow-${flow.id}`}
      className="relative scroll-mt-32 py-6 transition-opacity duration-300"
      style={{
        opacity: dimmed ? 0.45 : 1,
        borderBottom: isLast ? "none" : "1px solid var(--border-default)",
      }}
      onMouseEnter={() => onEnter(idx)}
      onMouseLeave={onLeave}
    >
      <span
        aria-hidden
        className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full transition-opacity duration-300"
        style={{
          backgroundColor: flow.accent,
          opacity: hoveredIdx === idx ? 1 : 0.55,
        }}
      />
      <div className="pl-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">
              FLOW · {String(idx + 1).padStart(2, "0")}
            </p>
            <h3 className="font-display text-2xl text-fg-base">
              {flow.label}
            </h3>
          </div>
          <p className="font-mono text-[11.5px] text-fg-muted">{flow.note}</p>
        </div>

        <div className="flex flex-nowrap items-stretch gap-0 overflow-x-auto pb-1">
          {flow.steps.map((s, i) => (
            <Fragment key={s.name}>
              <ServiceTile step={s} />
              {i < flow.steps.length - 1 ? (
                <span
                  aria-hidden
                  className="mx-1.5 shrink-0 self-center font-mono text-base text-fg-subtle select-none"
                >
                  ›
                </span>
              ) : null}
            </Fragment>
          ))}
        </div>

        <FlowTrack
          accent={flow.accent}
          steps={flow.steps.length}
          active={hoveredIdx === idx || hoveredIdx === -1}
          seed={idx}
        />
      </div>
    </div>
  );
}

export function ArchitectureFlow() {
  const [hovered, setHovered] = useState(-1);

  return (
    <section id="architecture" className="border-b border-border-muted/60 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          flows · four lanes
        </p>
        <h2 className="mt-3 max-w-3xl text-balance text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          Four flows, drawn the way{" "}
          <span className="display-italic text-brand-400">
            the console shows them.
          </span>
        </h2>
        <p className="mt-4 max-w-2xl text-base text-fg-muted">
          Hover a row to focus; the others fade. Packets travel each chain in
          real time. Click a chip to jump.
        </p>

        <div
          className="sticky top-16 z-30 mt-10 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border-default bg-bg-base/85 px-3 py-2.5 backdrop-blur-xl"
        >
          <span className="px-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-fg-subtle">
            jump to flow
          </span>
          {FLOWS.map((f) => (
            <Link
              key={f.id}
              href={`#flow-${f.id}`}
              className="rounded-md border border-border-default bg-bg-raised/60 px-2.5 py-1.5 font-mono text-[11.5px] text-fg-muted transition-all hover:border-brand-500 hover:bg-bg-elev hover:text-fg-base"
              style={{ borderLeft: `2px solid ${f.accent}` }}
            >
              {f.label}
            </Link>
          ))}
          <span className="ml-auto px-1 font-mono text-[11px] text-fg-subtle">
            <span className="text-brand-400">●</span> primary node
          </span>
        </div>

        <div className="rounded-2xl border border-border-default/80 bg-bg-raised/40 p-5 backdrop-blur-md">
          {FLOWS.map((f, i) => (
            <FlowRow
              key={f.id}
              flow={f}
              idx={i}
              hoveredIdx={hovered}
              onEnter={setHovered}
              onLeave={() => setHovered(-1)}
            />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-border-default bg-bg-raised/40 px-4 py-3">
          <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-fg-subtle">
            aws categories:
          </span>
          {(Object.entries(CAT_COLORS) as [Category, string][]).map(([k, c]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="block h-2 w-2 rounded-sm"
                style={{ backgroundColor: c }}
              />
              <span className="font-mono text-[11px] text-fg-muted">{k}</span>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
