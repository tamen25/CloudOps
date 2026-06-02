import Link from "next/link";
import {
  Search,
  Radio,
  Workflow,
  ShieldCheck,
  Database,
  Eye,
  type LucideIcon,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  meta: string;
}

const features: Feature[] = [
  {
    icon: Search,
    title: "Lambda + EKS hybrid search",
    body: "Cognito-authorised API Gateway in front of a Lambda that LRU-caches per tenant and HMAC-signs into Express on EKS, where the Postgres FTS index lives.",
    href: "/architecture#search",
    meta: "ADR-017",
  },
  {
    icon: Radio,
    title: "Realtime via WebSocket + Kinesis",
    body: "Order events publish to Kinesis post-commit; a fanout Lambda pushes owner-scoped updates to active WS connections. Stale connections prune on 410 Gone.",
    href: "/architecture#realtime",
    meta: "ADR-018",
  },
  {
    icon: Workflow,
    title: "Post-order workflow on Step Functions",
    body: "The authenticated API creates the order first; Step Functions keeps durable confirmation-email delivery, while the execution name remains the Idempotency-Key.",
    href: "/architecture#saga",
    meta: "ADR-019",
  },
  {
    icon: ShieldCheck,
    title: "Cognito → JWT everywhere",
    body: "One JWT verified the same way in middleware, Express, the search Lambda, and the WS connect handler. custom:tenant_id drives RLS in Postgres.",
    href: "/platform",
    meta: "ADR-016",
  },
  {
    icon: Database,
    title: "Multi-tenant by default",
    body: "Force-RLS on every customer-facing table. withTenant() opens a transaction, sets app.tenant_id, and commits — so a forgotten WHERE clause cannot leak.",
    href: "/platform",
    meta: "backlog #51",
  },
  {
    icon: Eye,
    title: "End-to-end OpenTelemetry",
    body: "Traceparent stitched from browser → Next.js RSC → API GW → Lambda → Express → RDS → Kinesis → fanout Lambda → WS push. One Grafana board.",
    href: "/traces",
    meta: "story #89",
  },
];

export function FeatureGrid() {
  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6 py-16">
      <header className="max-w-3xl space-y-3">
        <p className="text-xs uppercase tracking-wide text-brand-400">
          What ships
        </p>
        <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Six concrete demos behind one storefront.
        </h2>
        <p className="text-fg-muted">
          Each card is a path you can actually click through once a demo
          environment is up. The infrastructure is in <code className="font-mono">modules/</code> —
          the references below tell you exactly where to look.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <FeatureCard key={feature.title} feature={feature} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: Feature }) {
  const Icon = feature.icon;
  return (
    <Link href={feature.href} className="group block">
      <Card className="h-full transition-all group-hover:border-brand-500/60 group-hover:bg-bg-elev brand-glow">
        <CardHeader className="space-y-3">
          <div className="flex items-start justify-between">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500/12 text-brand-400 transition-transform group-hover:scale-105">
              <Icon className="h-5 w-5" strokeWidth={2} />
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wide text-fg-subtle">
              {feature.meta}
            </span>
          </div>
          <CardTitle className="text-base">{feature.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CardDescription className="text-sm leading-relaxed">
            {feature.body}
          </CardDescription>
          <span className="inline-flex items-center gap-1 text-xs text-brand-400 opacity-0 transition-opacity group-hover:opacity-100">
            see it →
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
