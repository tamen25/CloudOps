import { NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { fetchTopology } from "@/lib/observe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Service-map topology from the Tempo metrics-generator (via Mimir). Cognito-
// gated; upstream creds never leave the server.
export async function GET() {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const topology = await fetchTopology();
    return NextResponse.json(topology, {
      headers: { "cache-control": "private, max-age=3" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
