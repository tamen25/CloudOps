import { type NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  stateCookieName,
} from "@/lib/auth";

/**
 * PKCE login start. Route handler so cookie writes are legal — Next App
 * Router rejects cookie mutation from Server Components, which is why the
 * matching /login page just renders an "auth unavailable" message and
 * redirects here when Cognito env vars are present (closes backlog #92).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PKCE_COOKIE = "cloudops_pkce_verifier";
const NEXT_COOKIE = "cloudops_post_login";

export async function GET(req: NextRequest) {
  const hostedUi = process.env.OIDC_HOSTED_UI;
  const clientId = process.env.OIDC_CLIENT_ID;
  const audience = process.env.OIDC_AUDIENCE;
  if (!hostedUi || !clientId || !audience) {
    return NextResponse.redirect(new URL("/login", req.url), { status: 302 });
  }

  const origin = process.env.STOREFRONT_ORIGIN ?? req.nextUrl.origin;
  const redirectUri = `${origin.replace(/\/$/, "")}/auth/callback`;
  const { verifier, challenge } = await generatePkce();
  const state = generateState();
  const next = req.nextUrl.searchParams.get("next");

  const url = buildAuthorizeUrl({
    hostedUi,
    clientId,
    redirectUri,
    state,
    codeChallenge: challenge,
  });

  const res = NextResponse.redirect(url, { status: 302 });
  const cookieOpts = {
    httpOnly: true as const,
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 5 * 60,
  };
  res.cookies.set(PKCE_COOKIE, verifier, cookieOpts);
  res.cookies.set(stateCookieName, state, cookieOpts);
  if (next) res.cookies.set(NEXT_COOKIE, next, cookieOpts);
  return res;
}
