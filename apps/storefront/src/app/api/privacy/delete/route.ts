import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  resolveTenant,
  sessionCookieName,
  stateCookieName,
  verifySession,
} from "@/lib/auth";
import {
  clearCart,
  GUEST_COOKIE_NAME,
  resolveCartKey,
  type CartKey,
} from "@/lib/cart";
import { deleteUserConnections } from "@/lib/realtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE_URL = process.env.API_BASE_URL ?? "";
const PKCE_COOKIE = "cloudops_pkce_verifier";
const NEXT_COOKIE = "cloudops_post_login";

export async function POST() {
  if (!API_BASE_URL) {
    return NextResponse.json(
      { error: "privacy_erase_not_configured" },
      { status: 503 },
    );
  }

  const jar = await cookies();
  const session = jar.get(sessionCookieName)?.value;
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const claims = await verifySession(session);
  const tenant = resolveTenant(claims);
  if (!claims?.sub || !tenant) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const upstream = await fetch(`${API_BASE_URL}/privacy/erase`, {
    method: "POST",
    headers: { authorization: `Bearer ${session}` },
    cache: "no-store",
  });
  const eraseBody = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "privacy_erase_failed" },
      { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 },
    );
  }

  const authenticatedCart = await resolveCartKey();
  const guestId = jar.get(GUEST_COOKIE_NAME)?.value;
  const guestCart: CartKey | null = guestId
    ? { pk: `GUEST#${guestId}`, tenant: null, isGuest: true }
    : null;

  const [clearedAuthenticatedCartRows, clearedGuestCartRows, closedRealtimeConnections] =
    await Promise.all([
      authenticatedCart && !authenticatedCart.isGuest ? clearCart(authenticatedCart) : 0,
      guestCart ? clearCart(guestCart) : 0,
      deleteUserConnections(tenant, claims.sub),
    ]);

  const res = NextResponse.json(
    {
      success: true,
      erased: eraseBody?.erased ?? {},
      cleared: {
        authenticated_cart_rows: clearedAuthenticatedCartRows,
        guest_cart_rows: clearedGuestCartRows,
        realtime_connections: closedRealtimeConnections,
      },
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );

  res.cookies.delete(sessionCookieName);
  res.cookies.delete(GUEST_COOKIE_NAME);
  res.cookies.delete(stateCookieName);
  res.cookies.delete(PKCE_COOKIE);
  res.cookies.delete(NEXT_COOKIE);
  return res;
}
