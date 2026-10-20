// Shared BFF auth gates. requireSession() reads and verifies the session
// cookie; requireAdmin() also requires the Cognito admin group. Route
// handlers call one of them before touching any upstream.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAdmin, sessionCookieName, verifySession, type SessionClaims } from "@/lib/auth";

export async function requireSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return null;
  return verifySession(token);
}

// requireAdmin returns the claims, or the 401/403 response to send.
export async function requireAdmin(): Promise<SessionClaims | NextResponse> {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(claims)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return claims;
}
