import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bff-auth";
import { fetchRecentTraces, fetchTraceById } from "@/lib/observe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Recent-traces list, or a single trace when ?id= is given (Tempo). Admin
// only: traces are raw spans from every tenant (attributes, URLs, tenant
// IDs), and the list hands out their IDs. Aggregate service metrics and the
// topology carry no tenant data and stay open to any signed-in user.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const id = req.nextUrl.searchParams.get("id");
  try {
    if (id) {
      // Trace IDs are hex; reject anything else before hitting Tempo.
      if (!/^[a-fA-F0-9]{1,40}$/.test(id)) {
        return NextResponse.json({ error: "invalid_trace_id" }, { status: 400 });
      }
      const trace = await fetchTraceById(id);
      return NextResponse.json({ trace });
    }
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? 20);
    const traces = await fetchRecentTraces(limit);
    return NextResponse.json({ traces }, {
      headers: { "cache-control": "private, max-age=3" },
    });
  } catch {
    return NextResponse.json({ error: "upstream_unavailable" }, { status: 502 });
  }
}
