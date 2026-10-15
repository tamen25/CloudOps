import { NextResponse } from "next/server";
import { requireSession } from "@/lib/bff-auth";
import { getStatus } from "@/lib/loadgen-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Current run status. Cognito-gated (read-only; any signed-in user).
export async function GET() {
  const claims = await requireSession();
  if (!claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const baseUrl = process.env.LOADGEN_URL || "";
  if (!baseUrl) return NextResponse.json({ running: false, configured: false });

  try {
    const result = await getStatus({ baseUrl, secret: "" });
    return NextResponse.json(result.body, { status: result.status });
  } catch {
    return NextResponse.json({ error: "loadgen_unavailable" }, { status: 502 });
  }
}
