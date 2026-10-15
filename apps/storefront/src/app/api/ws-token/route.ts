import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SignJWT } from "jose";
import { sessionCookieName, verifySession } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TTL_SECONDS = 300;

export async function POST() {
  const secret = process.env.WS_TOKEN_SECRET ?? "";
  if (!secret) {
    return NextResponse.json({ error: "ws_token_disabled" }, { status: 503 });
  }
  const jar = await cookies();
  const session = jar.get(sessionCookieName)?.value;
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const claims = await verifySession(session);
  if (!claims?.sub) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const tenant = (claims["custom:tenant_id"] ?? claims.tenant_id) as string | undefined;
  if (!tenant) {
    return NextResponse.json({ error: "tenant_missing" }, { status: 400 });
  }

  const token = await new SignJWT({
    sub: claims.sub,
    "custom:tenant_id": tenant,
    token_use: "ws",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("cloudops-storefront")
    .setAudience("cloudops-ws")
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token, expires_in: TTL_SECONDS });
}
