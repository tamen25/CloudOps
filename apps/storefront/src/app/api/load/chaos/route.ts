import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { isAdmin } from "@/lib/auth";
import { triggerChaos } from "@/lib/loadgen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Trigger a chaos pod-kill (#143). Cognito-gated + admin-only — it can delete a
// live mesh pod. The loadgen re-checks the service against a fixed allowlist and
// defaults to dry-run, so a real kill needs an explicit {"dryRun": false} here.
export async function POST(req: NextRequest) {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!isAdmin(claims)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const baseUrl = process.env.LOADGEN_URL || "";
  const secret = process.env.INTERNAL_HMAC_SECRET || "";
  if (!baseUrl || !secret) {
    return NextResponse.json({ error: "loadgen_not_configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  try {
    const result = await triggerChaos(
      { baseUrl, secret },
      { service: String(body?.service ?? ""), dryRun: body?.dryRun === false },
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "loadgen_unavailable" }, { status: 502 });
  }
}
