import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import {
  exchangeCode,
  sessionCookieName,
  stateCookieName,
} from "@/lib/auth";

const PKCE_COOKIE = "cloudops_pkce_verifier";
const NEXT_COOKIE = "cloudops_post_login";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateFromRedirect = url.searchParams.get("state");

  const jar = await cookies();
  const verifier = jar.get(PKCE_COOKIE)?.value;
  const stateExpected = jar.get(stateCookieName)?.value;
  const nextPath = jar.get(NEXT_COOKIE)?.value ?? "/";

  if (!code || !stateFromRedirect || !verifier || !stateExpected) {
    return NextResponse.redirect(new URL("/login?error=missing_params", url));
  }
  if (stateFromRedirect !== stateExpected) {
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

    const dest = new URL(nextPath.startsWith("/") ? nextPath : "/", url);
    const res = NextResponse.redirect(dest);

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
    const reason = err instanceof Error ? err.message : "unknown_error";
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(reason)}`, url)
    );
  }
}
