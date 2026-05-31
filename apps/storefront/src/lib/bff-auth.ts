// Shared BFF auth gate. Reads the session cookie and verifies it; returns the
// claims or null. Route handlers use requireSession() to 401 unauthenticated
// callers before touching any upstream.
import { cookies } from "next/headers";
import { sessionCookieName, verifySession, type SessionClaims } from "@/lib/auth";

export async function requireSession(): Promise<SessionClaims | null> {
  const jar = await cookies();
  const token = jar.get(sessionCookieName)?.value;
  if (!token) return null;
  return verifySession(token);
}
