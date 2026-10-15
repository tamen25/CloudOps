"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CodeBlock } from "./CodeBlock";
import { OtelDiagram } from "./OtelDiagram";
import { DefenseDiagram } from "./DefenseDiagram";
import { SagaDiagram } from "./SagaDiagram";
import { PipelinePreview } from "./PipelinePreview";

interface Panel {
  step: string;
  title: string;
  display: string;
  sub: string;
  body: string;
  visual: ReactNode;
}

const PANELS: Panel[] = [
  {
    step: "isolation",
    title: "Row-Level Security",
    display: "Every query.",
    sub: "Every tenant. Zero trust.",
    body: "Postgres RLS with FORCE. Tenant context bound at JWT verify, then attached to the connection for the lifetime of the request. A forgotten WHERE clause can't leak across tenants.",
    visual: (
      <CodeBlock
        fileName="migrations/003_rls.sql"
        code={`ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id'));`}
      />
    ),
  },
  {
    step: "workflows",
    title: "Sagas & Streams",
    display: "Durable by default.",
    sub: "State that survives a node crash.",
    body: "Step Functions drives the checkout saga end-to-end. Kinesis broadcasts order events to downstream consumers. Both are at-least-once with idempotency keys baked into the contract.",
    visual: <SagaDiagram />,
  },
  {
    step: "visibility",
    title: "Full-stack telemetry",
    display: "Three signals.",
    sub: "Browser → Lambda → Postgres.",
    body: "OpenTelemetry covers spans, metrics, and logs. Every tenant attribute is auto-propagated. A single trace shows the whole journey, including the WebSocket fanout.",
    visual: <OtelDiagram />,
  },
  {
    step: "defense",
    title: "Zero-trust stack",
    display: "Five layers,",
    sub: "no soft middle.",
    body: "WAF at the edge, HSTS + CSP at the transport, JWT verify in the API gateway, RLS at the database, append-only audit log on the side. Defence-in-depth without surprise dependencies.",
    visual: <DefenseDiagram />,
  },
  {
    step: "shipping",
    title: "Production ready",
    display: "Approval gates.",
    sub: "Digest-pinned. Zero-downtime.",
    body: "Build → cosign → trivy → manual approval → kubectl rollout. /ready verifies, or kubectl rolls back. The same pipeline runs every PR.",
    visual: <PipelinePreview />,
  },
];

export function Journey() {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const nodes = refs.current.filter((n): n is HTMLElement => n !== null);
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = nodes.indexOf(visible.target as HTMLElement);
          if (idx >= 0) setActive(idx);
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: [0, 0.5, 1] },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);

  function scrollTo(idx: number) {
    const node = refs.current[idx];
    if (!node) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    node.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });
  }

  return (
    <section className="border-b border-border-muted/60 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid gap-14 lg:grid-cols-[220px_1fr]">
          <aside>
            <div className="lg:sticky lg:top-28">
              <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                journey
              </p>
              <ol className="flex flex-row gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
                {PANELS.map((p, i) => {
                  const isActive = i === active;
                  return (
                    <li key={p.step}>
                      <button
                        type="button"
                        onClick={() => scrollTo(i)}
                        aria-current={isActive ? "step" : undefined}
                        className={`flex w-full items-baseline gap-3 whitespace-nowrap text-left font-mono text-[12px] transition-colors ${
                          isActive
                            ? "text-fg-base"
                            : "text-fg-subtle hover:text-fg-muted"
                        }`}
                      >
                        <span
                          className={`tabular-nums ${
                            isActive ? "text-brand-500" : ""
                          }`}
                        >
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span
                          className={`h-px flex-none transition-all ${
                            isActive
                              ? "w-8 bg-brand-500"
                              : "w-4 bg-border-default"
                          }`}
                        />
                        <span>{p.step}</span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>

          <div className="flex flex-col gap-24">
            {PANELS.map((p, i) => (
              <article
                key={p.step}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12"
              >
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
                    {String(i + 1).padStart(2, "0")} · {p.step}
                  </p>
                  <h2 className="mt-3 text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
                    {p.display}{" "}
                    <span className="display-italic">{p.sub}</span>
                  </h2>
                  <p className="mt-5 max-w-md text-balance text-base text-fg-muted">
                    {p.body}
                  </p>
                </div>
                <div className="self-center">{p.visual}</div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
