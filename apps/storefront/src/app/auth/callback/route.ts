import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCode,
  sessionCookieName,
  stateCookieName,
} from "@/lib/auth";
import { isSafeNextPath } from "@/app/login/start/route";
import {
  maybeBlockForAuthBackoff,
  noteAuthFailure,
  noteAuthSuccess,
} from "@/lib/rate-limit";

const PKCE_COOKIE = "cloudops_pkce_verifier";
const NEXT_COOKIE = "cloudops_post_login";

/* Reason whitelist for the `?error=` query param on /login redirects.
 * Anything not in this set is collapsed to `unknown_error` so an exception
 * message from exchangeCode() cannot land in browser history / referers
 * (closes vuln 3 from the 2026-05-17 review). Server-side logging keeps
 * full context. */
const KNOWN_ERROR_REASONS = new Set([
  "missing_params",
  "state_mismatch",
  "misconfigured",
  "token_exchange_failed",
  "unknown_error",
]);

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const blocked = maybeBlockForAuthBackoff(req);
  if (blocked) return blocked;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromRedirect = url.searchParams.get("state");

  const jar = await cookies();
  const verifier = jar.get(PKCE_COOKIE)?.value;
  const stateExpected = jar.get(stateCookieName)?.value;
  const nextPath = jar.get(NEXT_COOKIE)?.value ?? "/";

  if (!code || !stateFromRedirect || !verifier || !stateExpected) {
    noteAuthFailure(req);
    return NextResponse.redirect(new URL("/login?error=missing_params", url));
  }
  if (stateFromRedirect !== stateExpected) {
    noteAuthFailure(req);
    return NextResponse.redirect(new URL("/login?error=state_mismatch", url));
  }

  const hostedUi = process.env.OIDC_HOSTED_UI;
  const clientId = process.env.OIDC_CLIENT_ID;
  if (!hostedUi || !clientId) {
    return NextResponse.redirect(new URL("/login?error=misconfigured", url));
  }

  const redirectUri = `${url.origin}/auth/callback`;

  try {
    const tokens = await exchangeCode({
      hostedUi,
      clientId,
      redirectUri,
      code,
      codeVerifier: verifier,
    });

    /* Defence-in-depth for #134. The cookie should already only carry safe
     * values (write-time guard in login/start/route.ts), but re-validate
     * here in case an older cookie still references a malicious target. */
    const candidate = isSafeNextPath(nextPath) ? nextPath : "/";
    const dest = new URL(candidate, url);
    if (dest.origin !== url.origin) {
      return NextResponse.redirect(new URL("/", url));
    }
    const res = NextResponse.redirect(dest);
    noteAuthSuccess(req);

    res.cookies.set(sessionCookieName, tokens.id_token, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: tokens.expires_in,
    });
    res.cookies.delete(PKCE_COOKIE);
    res.cookies.delete(stateCookieName);
    res.cookies.delete(NEXT_COOKIE);
    return res;
  } catch (err) {
    /* Vuln 3 — collapse to a whitelisted reason so err.message contents
     * cannot land in URL bar / browser history / referer. The full error
     * is still available server-side via the request logger. */
    console.error("token exchange failed", {
      message: err instanceof Error ? err.message : "unknown",
    });
    noteAuthFailure(req);
    return NextResponse.redirect(
      new URL("/login?error=token_exchange_failed", url)
    );
  }
}

export { KNOWN_ERROR_REASONS };
