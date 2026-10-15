import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { fetchRecentTraces, fetchTraceById } from "@/lib/observe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Recent-traces list, or a single trace when ?id= is given (Tempo).
export async function GET(req: NextRequest) {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

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
