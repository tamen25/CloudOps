import Link from "next/link";
import { redirect } from "next/navigation";

/**
 * Server Component for /login. Cookies cannot be mutated from this path in
 * Next App Router, so PKCE + state cookie issuance lives in
 * /login/start/route.ts (closes backlog #92). When Cognito env vars are
 * configured, this page just redirects there; otherwise it renders a
 * friendly "sign-in not wired here" state (closes #150) — the console pages
 * (/console, /services, /traces, /load) redirect here when unauthenticated,
 * and a raw config error was a confusing dead-end locally.
 */
export const dynamic = "force-dynamic";

// Public pages that work without auth — offered as a way out of the dead-end.
const PUBLIC_DESTINATIONS = [
  { href: "/", label: "Home" },
  { href: "/architecture", label: "Architecture" },
  { href: "/platform", label: "Platform" },
  { href: "/pipeline", label: "Pipeline" },
] as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const hostedUi = process.env.OIDC_HOSTED_UI;
  const clientId = process.env.OIDC_CLIENT_ID;
  const audience = process.env.OIDC_AUDIENCE;

  if (hostedUi && clientId && audience) {
    const qs = params.next ? `?next=${encodeURIComponent(params.next)}` : "";
    redirect(`/login/start${qs}`);
  }

  const wanted = params.next;

  return (
    <main className="mx-auto max-w-lg space-y-6 px-6 py-16">
      <div className="space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-fg-subtle">
          sign-in
        </p>
        <h1 className="text-2xl font-semibold">Sign-in isn&apos;t wired in this environment.</h1>
        <p className="text-sm leading-relaxed text-fg-muted">
          {wanted ? (
            <>
              <code className="font-mono text-fg-base">{wanted}</code> is part of
              the Cognito-gated operator console. This environment has no Cognito
              User Pool configured, so there&apos;s nothing to sign in against —
              expected when running the storefront locally without backend
              wiring.
            </>
          ) : (
            <>
              This environment has no Cognito User Pool configured, so there&apos;s
              nothing to sign in against — expected when running the storefront
              locally without backend wiring.
            </>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-bg-raised/50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          To enable the console
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          Set these on the deployment (or a local <code className="font-mono">.env.local</code>), then retry:
        </p>
        <ul className="mt-3 space-y-1 font-mono text-[12px] text-fg-base">
          <li>OIDC_HOSTED_UI</li>
          <li>OIDC_CLIENT_ID</li>
          <li>OIDC_AUDIENCE</li>
        </ul>
        <p className="mt-3 text-[12px] text-fg-subtle">
          Terraform exposes these as outputs once <code className="font-mono">enable_auth = true</code> (Cognito module, #80).
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
          Meanwhile, these work without sign-in
        </p>
        <div className="flex flex-wrap gap-2">
          {PUBLIC_DESTINATIONS.map((d) => (
            <Link
              key={d.href}
              href={d.href}
              className="rounded-md border border-border-default bg-bg-raised/60 px-3 py-1.5 text-sm text-fg-muted transition-colors hover:border-brand-500 hover:text-fg-base"
            >
              {d.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
