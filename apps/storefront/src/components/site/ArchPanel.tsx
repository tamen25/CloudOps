import {
  Globe,
  Cloud,
  Network,
  Boxes,
  ShieldCheck,
  Code2,
  Zap,
  Database,
  Activity,
  Radio,
  Workflow,
  Inbox,
  Mail,
  ChevronRight,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { ServiceTile, type ServiceCategory } from "./ServiceTile";

/**
 * Architecture flow panel. Renders 4 paths through the platform as rows of
 * AWS-styled tiles connected by chevron arrows. Each tile carries the
 * service category colour, a glyph, and a short detail line. Decorative
 * but accurate — every node maps to a real module in the repo.
 */

interface Node {
  icon: typeof Globe;
  category: ServiceCategory;
  name: string;
  detail?: string;
}

interface Flow {
  label: string;
  accent: ServiceCategory;
  nodes: Node[];
}

const flows: Flow[] = [
  {
    label: "Page load",
    accent: "frontend",
    nodes: [
      { icon: Globe, category: "client", name: "Browser", detail: "RSC + WS" },
      { icon: Cloud, category: "networking", name: "CloudFront", detail: "assets.<dom>" },
      { icon: Network, category: "networking", name: "ALB", detail: "group=cloudops" },
      { icon: Boxes, category: "frontend", name: "Next.js · EKS", detail: "middleware jwt" },
      { icon: ShieldCheck, category: "security", name: "Cognito", detail: "OIDC + JWKS" },
    ],
  },
  {
    label: "Search read",
    accent: "compute",
    nodes: [
      { icon: Network, category: "networking", name: "API GW HTTP", detail: "search.<dom>" },
      { icon: Zap, category: "compute", name: "search-gateway λ", detail: "LRU 60s + HMAC" },
      { icon: Code2, category: "compute", name: "Express · EKS", detail: "/_internal/search" },
      { icon: Database, category: "database", name: "RDS Postgres", detail: "FTS + RLS" },
    ],
  },
  {
    label: "Order + realtime",
    accent: "integration",
    nodes: [
      { icon: Code2, category: "compute", name: "Express /order", detail: "RLS + audit" },
      { icon: Activity, category: "analytics", name: "Kinesis", detail: "post-commit" },
      { icon: Zap, category: "compute", name: "ws-fanout λ", detail: "GSI by tenant" },
      { icon: Radio, category: "networking", name: "API GW WS", detail: "ws.<dom>" },
      { icon: Globe, category: "client", name: "Browser", detail: "live status pill" },
    ],
  },
  {
    label: "Checkout saga",
    accent: "integration",
    nodes: [
      { icon: Workflow, category: "integration", name: "Step Functions", detail: "Standard SM" },
      { icon: Code2, category: "compute", name: "Express /order", detail: "exec name = key" },
      { icon: Inbox, category: "integration", name: "SQS", detail: "order-email" },
      { icon: Zap, category: "compute", name: "order-email λ", detail: "Node 22 arm64" },
      { icon: Mail, category: "integration", name: "SES", detail: "verified sender" },
    ],
  },
];

const accentBar: Record<ServiceCategory, string> = {
  compute: "bg-[#ED7100]",
  database: "bg-[#3B48CC]",
  storage: "bg-[#7AA116]",
  networking: "bg-[#8C4FFF]",
  security: "bg-[#DD344C]",
  integration: "bg-[#E7157B]",
  analytics: "bg-[#5A4FCF]",
  ml: "bg-[#01A88D]",
  frontend: "bg-brand-500",
  client: "bg-border-default",
};

export function ArchPanel() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-16">
      <Card className="overflow-hidden border-border-default/80 bg-bg-raised/60 backdrop-blur">
        <CardHeader className="border-b border-border-muted/60">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">One request, four surfaces</CardTitle>
              <p className="text-xs text-fg-muted">
                Every node is a real module under <code className="font-mono">modules/</code>.
                Colours follow AWS service categories.
              </p>
            </div>
            <StatusPill variant="live">trace</StatusPill>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <div className="min-w-max space-y-8 px-6 py-8 md:px-8">
            {flows.map((flow) => (
              <div key={flow.label} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className={`h-1 w-8 rounded-full ${accentBar[flow.accent]}`} />
                  <span className="font-mono text-[11px] uppercase tracking-wider text-fg-muted">
                    {flow.label}
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  {flow.nodes.map((node, idx) => (
                    <div key={`${flow.label}-${node.name}-${idx}`} className="flex items-start gap-2">
                      <ServiceTile
                        Icon={node.icon}
                        category={node.category}
                        name={node.name}
                        detail={node.detail}
                      />
                      {idx < flow.nodes.length - 1 ? (
                        <ChevronRight
                          className="mt-3.5 h-5 w-5 shrink-0 text-fg-subtle"
                          strokeWidth={2.5}
                        />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-muted/60 px-6 py-3 text-[10px] text-fg-muted">
          <LegendDot color="#ED7100" label="Compute" />
          <LegendDot color="#3B48CC" label="Database" />
          <LegendDot color="#8C4FFF" label="Networking" />
          <LegendDot color="#DD344C" label="Security" />
          <LegendDot color="#E7157B" label="App Integration" />
          <LegendDot color="#5A4FCF" label="Analytics" />
          <LegendDot color="#2dd4bf" label="Frontend · CloudOps" />
        </div>
      </Card>
    </section>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
