import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { designPreviewEnabled } from "@/lib/flags";

export function CallToAction() {
  return (
    <section className="mx-auto max-w-7xl px-6 pb-16">
      <div className="relative overflow-hidden rounded-2xl border border-brand-500/30 bg-bg-raised p-10 md:p-14">
        <div className="absolute inset-0 -z-10 opacity-70 hero-glow" />
        <div className="absolute inset-0 -z-10 dot-grid opacity-30" />
        <div className="grid items-center gap-6 md:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Ready when you are.
            </h2>
            <p className="max-w-xl text-fg-muted">
              The platform is wired top to bottom. Open the live service map
              or walk the architecture flows end to end.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="brand-glow">
              <Link href="/console">
                Open the console
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href={designPreviewEnabled ? "/design" : "/architecture"}>
                {designPreviewEnabled ? "Design system" : "See the architecture"}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
