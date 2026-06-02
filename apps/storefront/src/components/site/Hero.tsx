import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SignalPills } from "./SignalPills";
import { designPreviewEnabled } from "@/lib/flags";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="mx-auto max-w-7xl px-6 pb-20 pt-16 md:pt-24">
        <div className="space-y-8">
          <SignalPills />

          <h1 className="max-w-4xl text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            <span className="gradient-text-brand">Production-shaped</span> operator console on Kubernetes &amp; AWS.
          </h1>

          <p className="max-w-2xl text-lg leading-relaxed text-fg-muted md:text-xl">
            A polyglot service mesh fanning out one synthetic order across six
            languages, with a live service map, span waterfalls, and a gated
            load generator. Built to show what prod-grade observability looks
            like — at portfolio cost.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="brand-glow">
              <Link href="/console">
                Open the console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href={designPreviewEnabled ? "/design" : "/architecture"}>
                <Sparkles className="h-4 w-4" />
                {designPreviewEnabled ? "See design system" : "See the architecture"}
              </Link>
            </Button>
          </div>

          <dl className="grid max-w-3xl grid-cols-2 gap-6 border-t border-border-muted/60 pt-8 sm:grid-cols-4">
            <Metric label="search p95 (warm)" value="< 100 ms" />
            <Metric label="checkout SLO" value="99.0 %" />
            <Metric label="WS reconnect" value="≤ 30 s" />
            <Metric label="idle cost / hr" value="≈ $0.20" />
          </dl>
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs uppercase tracking-wide text-fg-subtle">{label}</dt>
      <dd className="font-mono text-2xl text-fg-base">{value}</dd>
    </div>
  );
}
