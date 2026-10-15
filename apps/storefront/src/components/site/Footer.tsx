import Link from "next/link";
import { Boxes } from "lucide-react";
import { designPreviewEnabled } from "@/lib/flags";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border-muted/60">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-500/15 text-brand-500">
              <Boxes className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            CloudOps
          </div>
          <p className="text-sm text-fg-muted">
            Production-shaped multi-tenant storefront on AWS + EKS. Demo build.
          </p>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Console
          </h4>
          <ul className="space-y-1 text-sm">
            <li><Link href="/console" className="text-fg-base hover:text-brand-400">Service map</Link></li>
            <li><Link href="/services" className="text-fg-base hover:text-brand-400">Services</Link></li>
            <li><Link href="/traces" className="text-fg-base hover:text-brand-400">Traces</Link></li>
            <li><Link href="/load" className="text-fg-base hover:text-brand-400">Load</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            System
          </h4>
          <ul className="space-y-1 text-sm">
            <li><Link href="/login" className="text-fg-base hover:text-brand-400">Sign in</Link></li>
            {designPreviewEnabled ? (
              <li><Link href="/design" className="text-fg-base hover:text-brand-400">Design system</Link></li>
            ) : null}
            <li><Link href="/privacy" className="text-fg-base hover:text-brand-400">Privacy</Link></li>
            <li><Link href="/cookies" className="text-fg-base hover:text-brand-400">Cookies</Link></li>
          </ul>
        </div>

        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Platform
          </h4>
          <ul className="space-y-1 text-sm">
            <li><Link href="/platform" className="text-fg-base hover:text-brand-400">Overview</Link></li>
            <li><Link href="/architecture" className="text-fg-base hover:text-brand-400">Architecture</Link></li>
            <li><Link href="/diagrams" className="text-fg-base hover:text-brand-400">Diagrams</Link></li>
            <li><Link href="/pipeline" className="text-fg-base hover:text-brand-400">Pipeline</Link></li>
            <li><Link href="/pipeline#security" className="text-fg-base hover:text-brand-400">Security</Link></li>
          </ul>
          <p className="pt-2 font-mono text-[11px] leading-relaxed text-fg-subtle">
            Next.js 15 · EKS · Cognito · API GW · Lambda · Step Functions · DynamoDB · Kinesis · CloudFront · OTel
          </p>
        </div>
      </div>

      <div className="border-t border-border-muted/60 px-6 py-4 text-center text-xs text-fg-subtle">
        © 2026 CloudOps · all routes are demo-shaped · {`{`}storefront@0.1.0{`}`}
      </div>
    </footer>
  );
}
