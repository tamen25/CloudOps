import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import { sessionCookieName, verifySession } from "@/lib/auth";
import { getCart, resolveCartKey } from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_MACHINE_ARN = process.env.CHECKOUT_STATE_MACHINE_ARN ?? "";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";

const sfn = STATE_MACHINE_ARN ? new SFNClient({ region: AWS_REGION }) : null;

export async function POST() {
  if (!sfn || !STATE_MACHINE_ARN) {
    return NextResponse.json({ error: "checkout_not_configured" }, { status: 503 });
  }
  const jar = await cookies();
  const session = jar.get(sessionCookieName)?.value;
  if (!session) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const claims = await verifySession(session);
  if (!claims?.sub) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const tenant = (claims["custom:tenant_id"] ?? claims.tenant_id) as string | undefined;
  if (!tenant) return NextResponse.json({ error: "tenant_missing" }, { status: 400 });

  const cartKey = await resolveCartKey();
  if (!cartKey) {
    return NextResponse.json({ error: "cart_empty" }, { status: 400 });
  }
  const cartItems = await getCart(cartKey);
  if (cartItems.length === 0) {
    return NextResponse.json({ error: "cart_empty" }, { status: 400 });
  }
  const items = cartItems.map((it) => ({ sku: it.sku, quantity: it.qty }));
  const total =
    Math.round(
      cartItems.reduce((sum, it) => sum + it.price_cents * it.qty, 0)
    ) / 100;

  const cartHash = createHash("sha256")
    .update(JSON.stringify({ tenant, items, total }))
    .digest("hex")
    .slice(0, 32);
  const executionName = `${claims.sub.slice(0, 16)}-${cartHash}`;

  const command = new StartExecutionCommand({
    stateMachineArn: STATE_MACHINE_ARN,
    name: executionName,
    input: JSON.stringify({
      tenant_id: tenant,
      items,
      total,
      email: claims.email ?? "",
    }),
  });

  try {
    const res = await sfn.send(command);
    return NextResponse.json({
      executionArn: res.executionArn,
      startDate: res.startDate?.toISOString() ?? null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "start_execution_failed", detail: err instanceof Error ? err.message : "unknown" },
      { status: 500 }
    );
  }
}
