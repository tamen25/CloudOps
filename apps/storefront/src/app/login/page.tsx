import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  stateCookieName,
} from "@/lib/auth";

const PKCE_COOKIE = "cloudops_pkce_verifier";
const NEXT_COOKIE = "cloudops_post_login";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;
  const hostedUi = process.env.OIDC_HOSTED_UI;
  const clientId = process.env.OIDC_CLIENT_ID;
  const audience = process.env.OIDC_AUDIENCE;

  if (!hostedUi || !clientId || !audience) {
    return (
      <main className="mx-auto max-w-md space-y-4 px-6 py-16">
        <h1 className="text-2xl font-semibold">Authentication unavailable</h1>
        <p className="text-fg-muted text-sm">
          The Cognito User Pool is not configured for this environment. Set
          <code className="font-mono mx-1">OIDC_HOSTED_UI</code>,
          <code className="font-mono mx-1">OIDC_CLIENT_ID</code>, and
          <code className="font-mono mx-1">OIDC_AUDIENCE</code> on the
          deployment and retry.
        </p>
      </main>
    );
  }

  const origin = process.env.STOREFRONT_ORIGIN ?? "";
  const redirectUri = `${origin || ""}/auth/callback`;
  const { verifier, challenge } = await generatePkce();
  const state = generateState();

  const jar = await cookies();
  jar.set(PKCE_COOKIE, verifier, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });
  jar.set(stateCookieName, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 5 * 60,
  });
  if (params.next) {
    jar.set(NEXT_COOKIE, params.next, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 5 * 60,
    });
  }

  const url = buildAuthorizeUrl({
    hostedUi,
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  redirect(url);
}
