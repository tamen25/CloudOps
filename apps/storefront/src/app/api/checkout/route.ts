import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  SFNClient,
  StartExecutionCommand,
} from "@aws-sdk/client-sfn";
import { sessionCookieName, verifySession } from "@/lib/auth";
import {
  acquireCheckoutLock,
  getCart,
  releaseCheckoutLock,
  resolveCartKey,
} from "@/lib/cart";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_MACHINE_ARN = process.env.CHECKOUT_STATE_MACHINE_ARN ?? "";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const API_BASE_URL = process.env.API_BASE_URL ?? "";

const sfn = STATE_MACHINE_ARN ? new SFNClient({ region: AWS_REGION }) : null;

export async function POST() {
  if (!sfn || !STATE_MACHINE_ARN || !API_BASE_URL) {
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

  /* Closes backlog #128 — lock the cart before reading items so a
     concurrent add-to-cart cannot change the hash between hash-compute
     and SF StartExecution. The lock auto-expires after 60s in case the
     handler crashes mid-checkout. */
  const locked = await acquireCheckoutLock(cartKey);
  if (!locked) {
    return NextResponse.json({ error: "checkout_in_progress" }, { status: 409 });
  }

  try {
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

    // Create the order while the user's JWT is still present. The old design
    // let Step Functions call POST /order with only X-Tenant-Id, which meant
    // the API had to accept anonymous tenant-scoped writes. Keep the durable
    // workflow for post-order side effects, but make the protected business
    // write user-authenticated and idempotent here.
    const orderRes = await fetch(`${API_BASE_URL}/order`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session}`,
        "content-type": "application/json",
        "idempotency-key": executionName,
      },
      body: JSON.stringify({ items, total }),
      cache: "no-store",
    });
    const orderBody = (await orderRes.json().catch(() => null)) as
      | { order?: { order_id?: string }; error?: string; detail?: string }
      | null;
    const orderId = orderBody?.order?.order_id;
    if (!orderRes.ok || !orderId) {
      return NextResponse.json(
        {
          error: "create_order_failed",
          detail: orderBody?.detail ?? orderBody?.error ?? `order-api ${orderRes.status}`,
        },
        { status: orderRes.status >= 400 && orderRes.status < 500 ? orderRes.status : 502 }
      );
    }

    const command = new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: executionName,
      input: JSON.stringify({
        tenant_id: tenant,
        order_id: orderId,
        items,
        total,
        email: claims.email ?? "",
      }),
    });

    try {
      const res = await sfn.send(command);
      // Do not return the executionArn — a SFN ARN embeds the AWS account ID +
      // region (internal infra metadata). The confirmation UI only needs the
      // orderId. (Closes #138 / F-138-1.)
      return NextResponse.json({
        orderId,
        startDate: res.startDate?.toISOString() ?? null,
      });
    } catch (err) {
      // Collapse the raw SDK error to a fixed reason (mirror of #142) — log the
      // detail server-side instead of leaking it to the browser.
      console.error("checkout StartExecution failed", err);
      return NextResponse.json(
        { error: "start_execution_failed" },
        { status: 500 }
      );
    }
  } finally {
    await releaseCheckoutLock(cartKey);
  }
}
