import { NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { isAdmin } from "@/lib/auth";
import { stopRun } from "@/lib/loadgen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Stop the current load run. Cognito-gated + admin-only.
export async function POST() {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(claims)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const baseUrl = process.env.LOADGEN_URL || "";
  const secret = process.env.INTERNAL_HMAC_SECRET || "";
  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "loadgen_not_configured" }, { status: 503 });
  }

  try {
    const result = await stopRun({ baseUrl, secret });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "loadgen_unavailable" }, { status: 502 });
  }
}
