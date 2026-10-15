import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Readiness probe. Returns 200 once any upstream the pod must reach at boot
 * is reachable. For now there is nothing to check — Cognito JWKS reachability
 * lands in #80. Until then this returns 200 unconditionally so the rollout
 * succeeds.
 */
export async function GET() {
  const issuer = process.env.OIDC_ISSUER;
  const jwksUrl = process.env.OIDC_JWKS_URL;

  if (issuer && jwksUrl) {
    try {
      const res = await fetch(jwksUrl, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      if (!res.ok) {
        return NextResponse.json(
          { status: "not_ready", reason: "jwks_unreachable", code: res.status },
          { status: 503 }
        );
      }
    } catch {
      return NextResponse.json(
        { status: "not_ready", reason: "jwks_fetch_failed" },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({ status: "ready" });
}
