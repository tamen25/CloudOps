import Link from "next/link";
import { ArrowRight, MoveDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { ClusterOrbit } from "./ClusterOrbit";
import { HeroLogStream } from "./HeroLogStream";

export function PlatformHero() {
  return (
    <section className="relative isolate min-h-screen overflow-hidden border-b border-border-muted/60">
      <div className="absolute inset-0 -z-10 line-grid opacity-25" aria-hidden />
      <HeroLogStream />
      <ClusterOrbit />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center gap-8 px-6 py-32 text-center">
        <StatusPill variant="live" className="font-mono tracking-wide">
          v1.4.0 · production · 30-day uptime 99.94%
        </StatusPill>

        <h1
          className="display-italic max-w-5xl text-fg-base"
          style={{ fontSize: "clamp(64px, 11vw, 148px)" }}
        >
          CloudOps Platform
        </h1>

        <p className="max-w-2xl text-balance text-base text-fg-muted sm:text-lg">
          Multi-tenant SaaS on Kubernetes. Built for scale, designed for
          interviews — every layer instrumented, every line open source.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/platform">
              Explore the platform
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/architecture">
              View architecture
              <MoveDown className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2"
        >
          <span className="block h-12 w-px bg-gradient-to-b from-transparent via-fg-subtle/60 to-transparent" />
        </div>
      </div>
    </section>
  );
}
