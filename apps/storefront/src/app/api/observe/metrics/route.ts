import { NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { fetchServiceMetrics } from "@/lib/observe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Per-service rps + error rate for the /services grid + headline strip.
export async function GET() {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const services = await fetchServiceMetrics();
    return NextResponse.json({ services }, {
      headers: { "cache-control": "private, max-age=3" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
