import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";

/**
 * Compact ASCII-ish architecture readout that doubles as a portfolio
 * screenshot. Renders as plain monospace so the trace path is legible at
 * Lighthouse and copy-paste survives.
 */
export function ArchPanel() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-16">
      <Card className="overflow-hidden border-border-default/80 bg-bg-raised">
        <CardHeader className="border-b border-border-muted/60">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">One request, six surfaces</CardTitle>
            <StatusPill variant="live">trace</StatusPill>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <pre className="px-6 py-6 font-mono text-xs leading-relaxed text-fg-base">
{`browser
  └─► cloudfront ──► alb ──► next.js (eks, rsc + middleware jwt verify)
                              │
                              ├─► api gw http  ──► search-gateway λ ──► express /_internal/search ──► rds postgres + fts
                              │   (cognito jwt)    (lru cache 60s)        (rls: withTenant)
                              │
                              ├─► express /order ──► rls + audit_events ──► kinesis put (post-commit)
                              │                                              │
                              │                                              ▼
                              │                                      ws-fanout λ ──► api gw ws ──► browser (live pill)
                              │
                              └─► step functions ──► express /order (Idempotency-Key=execName)
                                                       ──► sqs ──► order-email λ ──► ses
`}
          </pre>
        </CardContent>
      </Card>
    </section>
  );
}
