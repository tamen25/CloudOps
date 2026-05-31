import { type NextRequest, NextResponse } from "next/server";
import {
  buildAuthorizeUrl,
  generatePkce,
  generateState,
  stateCookieName,
} from "@/lib/auth";
import { maybeBlockForAuthBackoff } from "@/lib/rate-limit";

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

export function isSafeNextPath(p: string | null | undefined): p is string {
  if (typeof p !== "string" || p.length === 0) return false;
  if (!p.startsWith("/")) return false;
  if (p.startsWith("//") || p.startsWith("/\\")) return false;
  return true;
}

export async function GET(req: NextRequest) {
  const blocked = maybeBlockForAuthBackoff(req);
  if (blocked) return blocked;

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
  /* Closes #134 open-redirect. `?next=` is user-controlled — only persist it
   * when it parses as a same-origin relative path. Reject protocol-relative
   * (`//x`) and Windows-style (`/\\x`) prefixes; both round-trip through
   * `new URL(next, origin)` to a foreign origin. */
  const rawNext = req.nextUrl.searchParams.get("next");
  const next = isSafeNextPath(rawNext) ? rawNext : null;

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
