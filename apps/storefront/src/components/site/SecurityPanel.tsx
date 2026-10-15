import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { SloGauge } from "./SloGauge";
import { Sparkline } from "./Sparkline";

const GITHUB_REPO = "https://github.com/cloudops-platform/cloudops-shop";

const COMPLIANCE = [
  {
    layer: "Identity",
    control: "Cognito + JWKS verify",
    source: "docs/adr/016-auth-jwt.md",
  },
  {
    layer: "Tenancy",
    control: "Postgres RLS · force",
    source: "apps/order-api/migrations/003_rls.sql",
  },
  {
    layer: "Transport",
    control: "HSTS · CSP · COOP/CORP",
    source: "apps/storefront/next.config.ts",
  },
  {
    layer: "Secrets",
    control: "Secrets Mgr + IRSA",
    source: "apps/order-api/k8s/deployment.yaml",
  },
  {
    layer: "Supply chain",
    control: "Cosign + Trivy + Gatekeeper",
    source: "docs/adr/020-supply-chain.md",
  },
  {
    layer: "Observability",
    control: "OTel · 3 signals · SLO",
    source: "modules/observability/",
  },
];

const SPARKS = [
  { id: "jwt", label: "jwt_verify_total{ok}", pattern: "staircase" as const },
  { id: "p99", label: "order p99", pattern: "spike" as const },
  { id: "ws", label: "WS connect success", pattern: "flat" as const },
  { id: "rb", label: "rollback events", pattern: "zero-bump" as const },
];

export function SecurityPanel() {
  return (
    <section id="security" className="py-20">
      <div className="mx-auto max-w-7xl px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          security posture · live
        </p>
        <h2 className="mt-3 max-w-3xl text-4xl font-medium leading-tight tracking-tight text-fg-base sm:text-5xl">
          Six layers. <span className="display-italic">One source of truth.</span>
        </h2>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-2xl border border-border-default/80 bg-bg-raised/40 backdrop-blur-md">
            <table className="w-full font-mono text-[12px]">
              <thead>
                <tr className="border-b border-border-muted/60 text-left text-[10px] uppercase tracking-wider text-fg-subtle">
                  <th className="px-5 py-3 font-normal">Layer</th>
                  <th className="px-5 py-3 font-normal">Control</th>
                  <th className="px-5 py-3 font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {COMPLIANCE.map((row) => (
                  <tr
                    key={row.layer}
                    className="border-b border-border-muted/40 last:border-b-0"
                  >
                    <td className="px-5 py-3 text-fg-base">{row.layer}</td>
                    <td className="px-5 py-3 text-fg-muted">{row.control}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`${GITHUB_REPO}/blob/main/${row.source}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-brand-400 hover:text-brand-500"
                      >
                        <span className="truncate">{row.source}</span>
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <aside className="flex flex-col items-center gap-6 rounded-2xl border border-border-default/80 bg-bg-raised/40 p-6 backdrop-blur-md">
            <SloGauge
              valuePct={99.0}
              label="checkout availability"
              sublabel="30-day"
            />
            <div className="grid w-full grid-cols-2 gap-3">
              {SPARKS.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border-muted/60 bg-bg-base/40 px-3 py-2"
                >
                  <span className="font-mono text-[10px] text-fg-subtle">
                    {s.label}
                  </span>
                  <Sparkline
                    seed={1 + i * 173}
                    pattern={s.pattern}
                    color={s.pattern === "spike" ? "#f59e0b" : "#2dd4bf"}
                  />
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
