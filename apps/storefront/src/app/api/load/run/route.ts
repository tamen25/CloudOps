import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/bff-auth";
import { startRun } from "@/lib/loadgen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Start a load run. Cognito-gated + admin-only (it generates real traffic).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const baseUrl = process.env.LOADGEN_URL || "";
  const secret = process.env.INTERNAL_HMAC_SECRET || "";
  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "loadgen_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const result = await startRun(
      { baseUrl, secret },
      { scenario: String(body?.scenario ?? ""), rps: body?.rps, durationSeconds: body?.durationSeconds },
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "loadgen_unavailable" }, { status: 502 });
  }
}
