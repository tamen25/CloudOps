import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  resolveTenant,
  sessionCookieName,
  verifySession,
} from "@/lib/auth";
import { getCart, resolveCartKey } from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE_URL = process.env.API_BASE_URL ?? "";

export async function GET() {
  if (!API_BASE_URL) {
    return NextResponse.json(
      { error: "privacy_export_not_configured" },
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

  const upstream = await fetch(`${API_BASE_URL}/privacy/export`, {
    headers: { authorization: `Bearer ${session}` },
    cache: "no-store",
  });
  const orderApiBody = await upstream.json().catch(() => null);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "privacy_export_failed" },
      { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 },
    );
  }

  const cartKey = await resolveCartKey();
  const exportBody = {
    exported_at: new Date().toISOString(),
    user: {
      sub: claims.sub,
      email: claims.email ?? null,
      tenant_id: tenant,
    },
    cart: cartKey && !cartKey.isGuest ? await getCart(cartKey) : [],
    order_api: orderApiBody,
  };

  return NextResponse.json(exportBody, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'attachment; filename="cloudops-data-export.json"',
    },
  });
}
