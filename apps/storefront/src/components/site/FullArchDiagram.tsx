"use client";

import { useState } from "react";

interface Node {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub: string;
  layer: keyof typeof LAYER_COLOR;
}

const LAYER_COLOR = {
  edge: "#67e8f9",
  compute: "#2dd4bf",
  data: "#a78bfa",
  obs: "#fbbf24",
} as const;

type NodeId =
  | "browser"
  | "mobile"
  | "alb"
  | "storefront"
  | "orderApi"
  | "gateway"
  | "pricing"
  | "inventory"
  | "fraud"
  | "payment"
  | "ledger"
  | "cognito"
  | "aurora"
  | "kinesis"
  | "meshEvents"
  | "projection"
  | "otel"
  | "prom"
  | "loki"
  | "tempo"
  | "cloudwatch"
  | "yace"
  | "grafana"
  | "libraries";

const ARCH_NODES: Record<NodeId, Node> = {
  browser: { x: 230, y: 40, w: 120, h: 40, label: "Browser", sub: "Next.js · TS", layer: "edge" },
  mobile: { x: 380, y: 40, w: 120, h: 40, label: "Mobile", sub: "iOS · Android", layer: "edge" },
  alb: { x: 300, y: 120, w: 200, h: 50, label: "ALB + WAF", sub: "5 managed rules · TLS 1.3", layer: "edge" },
  storefront: { x: 90, y: 210, w: 180, h: 52, label: "storefront pod", sub: "Next.js · operator console", layer: "compute" },
  orderApi: { x: 300, y: 210, w: 180, h: 52, label: "order-api pod", sub: "Node22 · Express · RLS", layer: "compute" },
  // Polyglot mesh: one synthetic place-order fans out across these six.
  gateway: { x: 520, y: 210, w: 180, h: 52, label: "api-gateway", sub: "Node · BFF + HMAC", layer: "compute" },
  pricing: { x: 70, y: 300, w: 108, h: 46, label: "pricing", sub: "Go", layer: "compute" },
  inventory: { x: 192, y: 300, w: 108, h: 46, label: "inventory", sub: "Python", layer: "compute" },
  fraud: { x: 314, y: 300, w: 108, h: 46, label: "fraud", sub: "Java", layer: "compute" },
  payment: { x: 436, y: 300, w: 108, h: 46, label: "payment", sub: "Node", layer: "compute" },
  ledger: { x: 558, y: 300, w: 108, h: 46, label: "ledger", sub: "Go", layer: "compute" },
  cognito: { x: 70, y: 408, w: 150, h: 48, label: "Cognito", sub: "PKCE · JWT", layer: "data" },
  aurora: { x: 240, y: 408, w: 150, h: 48, label: "RDS · Postgres", sub: "RLS FORCE", layer: "data" },
  kinesis: { x: 410, y: 408, w: 150, h: 48, label: "Kinesis", sub: "event stream", layer: "data" },
  meshEvents: { x: 580, y: 408, w: 150, h: 48, label: "mesh-events", sub: "enrich → EB → λ", layer: "data" },
  projection: { x: 410, y: 480, w: 150, h: 44, label: "projection-worker", sub: "Python · read model", layer: "data" },
  cloudwatch: { x: 588, y: 480, w: 142, h: 44, label: "CloudWatch", sub: "AWS metrics", layer: "data" },
  otel: { x: 60, y: 560, w: 150, h: 46, label: "OTel Collector", sub: "metrics·logs·spans", layer: "obs" },
  yace: { x: 222, y: 560, w: 120, h: 46, label: "yace", sub: "CW → Prom", layer: "obs" },
  prom: { x: 354, y: 560, w: 118, h: 46, label: "Mimir", sub: "metrics", layer: "obs" },
  loki: { x: 484, y: 560, w: 110, h: 46, label: "Loki", sub: "logs", layer: "obs" },
  tempo: { x: 606, y: 560, w: 124, h: 46, label: "Tempo", sub: "traces · svc graph", layer: "obs" },
  grafana: { x: 300, y: 638, w: 200, h: 46, label: "Grafana", sub: "dashboards · alerts", layer: "obs" },
  libraries: { x: 596, y: 40, w: 150, h: 52, label: "client libraries", sub: "6 langs → CodeArtifact", layer: "edge" },
};

const EKS_BOX = { x: 55, y: 192, w: 670, h: 168 };

const ARCH_EDGES: [NodeId, NodeId][] = [
  ["browser", "alb"],
  ["mobile", "alb"],
  ["alb", "storefront"],
  ["alb", "orderApi"],
  ["alb", "gateway"],
  ["storefront", "cognito"],
  ["orderApi", "aurora"],
  ["orderApi", "kinesis"],
  // mesh fan-out: gateway → pricing → inventory → fraud → payment → ledger
  ["gateway", "pricing"],
  ["gateway", "inventory"],
  ["gateway", "fraud"],
  ["gateway", "payment"],
  ["payment", "ledger"],
  // async lanes off Kinesis
  ["kinesis", "meshEvents"],
  ["kinesis", "projection"],
  ["orderApi", "otel"],
  ["storefront", "otel"],
  ["gateway", "otel"],
  ["otel", "prom"],
  ["otel", "loki"],
  ["otel", "tempo"],
  // yace: CloudWatch → Prometheus (scrape, ServiceMonitor)
  ["cloudwatch", "yace"],
  ["yace", "prom"],
  // Grafana reads the three backends
  ["prom", "grafana"],
  ["loki", "grafana"],
  ["tempo", "grafana"],
];

const NODE_DETAILS: Record<NodeId, { tech: string; notes: string }> = {
  browser: {
    tech: "Next.js 15 · React 19 · App Router",
    notes: "TLS to ALB; CSP locked down; HttpOnly auth cookie",
  },
  mobile: {
    tech: "iOS + Android via React Native",
    notes: "shares OpenAPI client with web",
  },
  alb: {
    tech: "AWS ALB + WAFv2",
    notes:
      "5 managed rule groups · OWASP, bot control, IP rep, anonymous, account takeover",
  },
  storefront: {
    tech: "Next.js pod · HPA 2–12",
    notes: "SSR/ISR · cache headers digest-pinned",
  },
  orderApi: {
    tech: "Node22 · Express · pino · OTel",
    notes: "HPA 2–12 · p95 47ms · RLS context per request",
  },
  gateway: {
    tech: "api-gateway · Node · Express",
    notes: "mesh BFF · fans place-order across 6 services · HMAC service-to-service",
  },
  pricing: {
    tech: "pricing · Go",
    notes: "quote leg of the mesh fan-out · direct OTel instrumentation",
  },
  inventory: {
    tech: "inventory · Python",
    notes: "reserve leg · OTLP traces propagate the synthetic tenant tag",
  },
  fraud: {
    tech: "fraud · Java",
    notes: "score leg · chaos scenario injects faults here (#143)",
  },
  payment: {
    tech: "payment · Node",
    notes: "charge leg · HMAC-signs into ledger (x-cloudops-hmac)",
  },
  ledger: {
    tech: "ledger · Go",
    notes: "post-entry leg · terminal hop of the mesh chain",
  },
  cognito: {
    tech: "AWS Cognito User Pool",
    notes:
      "PKCE flow · custom:tenant_id · 24h tokens · refresh rotation",
  },
  aurora: {
    tech: "RDS · Postgres 16",
    notes: "RLS FORCE · KMS encrypted · 7d PITR · cross-AZ",
  },
  kinesis: {
    tech: "Kinesis Data Streams",
    notes: "Order events · 24h retention · tenant-partitioned · two consumers",
  },
  meshEvents: {
    tech: "modules/mesh-events · 2 Lambdas",
    notes: "enrichment λ → EventBridge bus → analytics λ · EMF metrics",
  },
  projection: {
    tech: "projection-worker · Python",
    notes: "second Kinesis consumer · builds a CQRS-style read model",
  },
  otel: {
    tech: "OpenTelemetry Collector · sidecar",
    notes: "OTLP gRPC · tail sampling · PII scrubber",
  },
  prom: {
    tech: "Grafana Mimir · workload metrics",
    notes: "Tempo metrics-generator feeds the console service map · SLO rules",
  },
  loki: {
    tech: "Grafana Loki · log aggregation",
    notes: "JSON parsed · tenant-tagged · 7d retention",
  },
  tempo: {
    tech: "Grafana Tempo · distributed traces",
    notes: "Full-stack spans · 3d retention · service graph",
  },
  cloudwatch: {
    tech: "AWS CloudWatch · native metrics",
    notes: "RDS, ALB, NAT GW, Lambda, Kinesis, Step Functions — source for yace",
  },
  yace: {
    tech: "yace · Yet Another CloudWatch Exporter",
    notes: "Scrapes CloudWatch → Prometheus metrics · IRSA · gated by enable_yace",
  },
  grafana: {
    tech: "Grafana · dashboards + alerting",
    notes: "Auto-provisioned datasources: Mimir, Loki, Tempo · 8 dashboards · SLO alerts",
  },
  libraries: {
    tech: "OTel client libraries · 6 languages",
    notes: "Node/Java/.NET/Python/Go/C++ logs+metrics+traces · published to CodeArtifact, not imported in-repo",
  },
};

interface AwsService {
  name: string;
  icon: string;
  cost: string;
}

const AWS_SERVICES: AwsService[] = [
  { name: "EKS", icon: "⬢", cost: "$73 mo" },
  { name: "RDS · pg", icon: "◉", cost: "$140 mo" },
  { name: "Cognito", icon: "⚿", cost: "$0–25 mo" },
  { name: "ALB", icon: "⚠", cost: "$22 mo" },
  { name: "WAF", icon: "⛨", cost: "$10 mo" },
  { name: "CloudFront", icon: "⌬", cost: "$8 mo" },
  { name: "Kinesis", icon: "⇋", cost: "$12 mo" },
  { name: "Lambda", icon: "λ", cost: "$3 mo" },
  { name: "DynamoDB", icon: "⊟", cost: "$6 mo" },
  { name: "S3", icon: "⛁", cost: "$4 mo" },
  { name: "KMS", icon: "⚷", cost: "$3 mo" },
  { name: "Secrets", icon: "⛒", cost: "$2 mo" },
  { name: "Step Fn", icon: "⇄", cost: "$1 mo" },
  { name: "API GW", icon: "⇉", cost: "$5 mo" },
  { name: "Route 53", icon: "⌖", cost: "$1 mo" },
  { name: "CloudWatch", icon: "⏱", cost: "$8 mo" },
  { name: "GuardDuty", icon: "⚯", cost: "$15 mo" },
  { name: "ECR", icon: "◰", cost: "$2 mo" },
  { name: "CodeBuild", icon: "⚒", cost: "$1 mo" },
  { name: "SQS", icon: "◫", cost: "$0 mo" },
  { name: "SNS", icon: "◐", cost: "$0 mo" },
  { name: "IAM", icon: "⚖", cost: "free" },
  { name: "VPC", icon: "▣", cost: "$32 mo" },
  { name: "CloudTrail", icon: "⏰", cost: "$2 mo" },
];

const LAYER_LABELS = [
  { y: 28, t: "edge", c: LAYER_COLOR.edge },
  { y: 185, t: "eks · kubernetes", c: LAYER_COLOR.compute },
  { y: 400, t: "data", c: LAYER_COLOR.data },
  { y: 532, t: "observability", c: LAYER_COLOR.obs },
];

// Smooth Bézier connectors: drop out of the source, curve through the midline,
// and ease into the target. Rounded by design — matches the soft look the rest
// of this diagram uses.
function edgePath(a: Node, b: Node): { d: string; x1: number; y1: number; x2: number; y2: number } {
  const x1 = a.x + a.w / 2;
  const y1 = a.y + a.h;
  const x2 = b.x + b.w / 2;
  const y2 = b.y;
  const mid = (y1 + y2) / 2;
  return {
    d: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`,
    x1,
    y1,
    x2,
    y2,
  };
}

export function FullArchDiagram() {
  const [hovered, setHovered] = useState<NodeId | null>(null);
  const active = hovered;
  const details = active ? NODE_DETAILS[active] : null;

  return (
    <section id="architecture-full" className="border-b border-border-muted/60 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          the full picture
        </p>
        <h2 className="mt-3 max-w-3xl text-balance text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          One diagram. <span className="display-italic">Every layer.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-base text-fg-muted">
          Hover any node to inspect tech, cost, and ownership. The whole stack
          — from browser request to observability backend.
        </p>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
          <div className="relative overflow-hidden rounded-2xl border border-border-default/80 bg-bg-raised/40 p-6 backdrop-blur-md">
            <svg
              viewBox="0 0 800 700"
              className="block h-auto w-full"
              role="img"
              aria-label="CloudOps full architecture"
            >
              <defs>
                <filter id="archGlow">
                  <feGaussianBlur stdDeviation="2" />
                </filter>
                <linearGradient id="eksFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(45,212,191,0.15)" />
                  <stop offset="100%" stopColor="rgba(45,212,191,0.04)" />
                </linearGradient>
              </defs>

              {LAYER_LABELS.map((l) => (
                <text
                  key={l.t}
                  x="14"
                  y={l.y}
                  fontFamily="var(--font-mono)"
                  fontSize="9"
                  letterSpacing="2"
                  fill={l.c}
                  opacity="0.6"
                >
                  {l.t.toUpperCase()}
                </text>
              ))}

              <rect
                x={EKS_BOX.x}
                y={EKS_BOX.y}
                width={EKS_BOX.w}
                height={EKS_BOX.h}
                rx="14"
                fill="url(#eksFill)"
                stroke="rgba(45,212,191,0.35)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={EKS_BOX.x + 12}
                y={EKS_BOX.y + 14}
                fontFamily="var(--font-mono)"
                fontSize="9"
                fill="#5eead4"
              >
                EKS · order-api + storefront + polyglot mesh (6 svc)
              </text>

              {ARCH_EDGES.map(([from, to], i) => {
                const a = ARCH_NODES[from];
                const b = ARCH_NODES[to];
                const { d } = edgePath(a, b);
                const isHL = active === from || active === to;
                const dur = 2.5 + (i % 3) * 0.4;
                return (
                  <g key={`${from}-${to}`}>
                    <path
                      d={d}
                      fill="none"
                      stroke={isHL ? "#5eead4" : "rgba(94,234,212,0.4)"}
                      strokeWidth={isHL ? 1.6 : 1}
                      strokeDasharray={isHL ? "0" : "3 4"}
                      filter={isHL ? "url(#archGlow)" : undefined}
                    />
                    <circle
                      r={isHL ? 3 : 2}
                      fill={isHL ? "#5eead4" : "rgba(94,234,212,0.85)"}
                      data-motion="packet"
                    >
                      <animateMotion
                        dur={`${dur}s`}
                        repeatCount="indefinite"
                        begin={`${(i * 0.18) % 2}s`}
                        path={d}
                      />
                      <animate
                        attributeName="opacity"
                        values="0;1;1;0"
                        keyTimes="0;0.1;0.9;1"
                        dur={`${dur}s`}
                        begin={`${(i * 0.18) % 2}s`}
                        repeatCount="indefinite"
                      />
                    </circle>
                  </g>
                );
              })}

              {(Object.entries(ARCH_NODES) as [NodeId, Node][]).map(
                ([k, n]) => {
                  const c = LAYER_COLOR[n.layer];
                  const isActive = active === k;
                  return (
                    <g
                      key={k}
                      onMouseEnter={() => setHovered(k)}
                      onMouseLeave={() =>
                        setHovered((h) => (h === k ? null : h))
                      }
                    >
                      <rect
                        x={n.x}
                        y={n.y}
                        width={n.w}
                        height={n.h}
                        rx="8"
                        fill={isActive ? `${c}30` : "rgba(20,28,45,0.85)"}
                        stroke={isActive ? c : "rgba(94,234,212,0.35)"}
                        strokeWidth={isActive ? 1.6 : 1}
                        strokeDasharray={k === "libraries" ? "5 4" : undefined}
                        filter={isActive ? "url(#archGlow)" : undefined}
                      />
                      <text
                        x={n.x + n.w / 2}
                        y={n.y + 22}
                        textAnchor="middle"
                        fontFamily="var(--font-sans)"
                        fontSize="13"
                        fontWeight="500"
                        fill={isActive ? c : "var(--fg-base)"}
                      >
                        {n.label}
                      </text>
                      <text
                        x={n.x + n.w / 2}
                        y={n.y + 40}
                        textAnchor="middle"
                        fontFamily="var(--font-mono)"
                        fontSize="9"
                        fill="rgba(139,148,158,0.9)"
                      >
                        {n.sub}
                      </text>
                    </g>
                  );
                },
              )}
            </svg>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 overflow-hidden rounded-b-2xl">
              <svg
                viewBox="0 0 800 80"
                preserveAspectRatio="none"
                className="block h-full w-full"
              >
                <path
                  d="M 0 50 Q 200 20, 400 50 T 800 50 L 800 80 L 0 80 Z"
                  fill="rgba(45,212,191,0.06)"
                />
                <path
                  d="M 0 60 Q 200 40, 400 60 T 800 60 L 800 80 L 0 80 Z"
                  fill="rgba(45,212,191,0.04)"
                />
              </svg>
            </div>

            {active && details ? (
              <div
                className="animate-fade-up pointer-events-none absolute bottom-7 right-7 w-[320px] max-w-[calc(100%-3.5rem)] rounded-xl border border-border-default bg-bg-elev/85 p-4 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl"
                key={active}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                  ▸ {ARCH_NODES[active].label}
                </p>
                <p className="mt-2 font-mono text-[12px] text-brand-400">
                  {details.tech}
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">
                  {details.notes}
                </p>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-4">
            <div className="rounded-2xl border border-border-default/80 bg-bg-raised/40 p-6 backdrop-blur-md">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                AWS Services
              </p>
              <h3 className="display-italic mt-2 text-3xl text-fg-base">
                24 services
              </h3>
              <p className="font-mono text-[12px] text-fg-muted">
                ~$352 /month · prod-equivalent traffic
              </p>
              <div className="mt-5 grid grid-cols-3 gap-2">
                {AWS_SERVICES.map((s) => (
                  <div
                    key={s.name}
                    title={`${s.name} · ${s.cost}`}
                    className="group flex cursor-default flex-col items-center gap-1 rounded-lg border border-border-default/60 bg-bg-base/40 px-1.5 py-2.5 text-center transition-all hover:-translate-y-0.5 hover:border-brand-500/60 hover:shadow-[0_0_18px_rgba(45,212,191,0.18)]"
                  >
                    <span
                      className="text-lg text-brand-500"
                      style={{ textShadow: "0 0 8px rgba(45,212,191,0.6)" }}
                    >
                      {s.icon}
                    </span>
                    <span className="truncate font-mono text-[9px] text-fg-muted">
                      {s.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-border-default/80 bg-bg-raised/40 p-5 backdrop-blur-md">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                Layer legend
              </p>
              <div className="mt-3 flex flex-col gap-2.5">
                {([
                  ["edge", "Edge", LAYER_COLOR.edge],
                  ["compute", "Compute · EKS", LAYER_COLOR.compute],
                  ["data", "Data", LAYER_COLOR.data],
                  ["obs", "Observability", LAYER_COLOR.obs],
                ] as const).map(([k, l, c]) => (
                  <div key={k} className="flex items-center gap-3">
                    <span
                      className="block h-3 w-3 rounded-sm"
                      style={{
                        backgroundColor: c,
                        boxShadow: `0 0 8px ${c}`,
                      }}
                    />
                    <span className="text-sm text-fg-muted">{l}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
