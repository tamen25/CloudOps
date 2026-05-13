import { redirect } from "next/navigation";

/**
 * Server Component for /login. Cookies cannot be mutated from this path in
 * Next App Router, so PKCE + state cookie issuance lives in
 * /login/start/route.ts (closes backlog #92). When Cognito env vars are
 * configured, this page just redirects there; otherwise it renders an
 * "auth unavailable" message so devs see what's missing.
 */
export const dynamic = "force-dynamic";

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

  return (
    <main className="mx-auto max-w-md space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Authentication unavailable</h1>
      <p className="text-fg-muted text-sm">
        The Cognito User Pool is not configured for this environment. Set
        <code className="font-mono mx-1">OIDC_HOSTED_UI</code>,
        <code className="font-mono mx-1">OIDC_CLIENT_ID</code>, and
        <code className="font-mono mx-1">OIDC_AUDIENCE</code> on the deployment
        and retry.
      </p>
    </main>
  );
}
