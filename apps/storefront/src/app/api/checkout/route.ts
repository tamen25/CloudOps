import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { sessionCookieName, verifySession } from "@/lib/auth";
import {
  acquireCheckoutLock,
  clearCart,
  getCart,
  releaseCheckoutLock,
  resolveCartKey,
} from "@/lib/cart";
import { checkout } from "@/lib/checkout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATE_MACHINE_ARN = process.env.CHECKOUT_STATE_MACHINE_ARN ?? "";
const AWS_REGION = process.env.AWS_REGION ?? "us-east-1";
const API_BASE_URL = process.env.API_BASE_URL ?? "";

const sfn = STATE_MACHINE_ARN ? new SFNClient({ region: AWS_REGION }) : null;

// The session and the cart are resolved here; the order flow is
// lib/checkout.ts.
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

  const result = await checkout(
    { session, sub: claims.sub, tenant, email: claims.email },
    {
      apiBaseUrl: API_BASE_URL,
      fetchImpl: fetch,
      acquireLock: () => acquireCheckoutLock(cartKey),
      releaseLock: () => releaseCheckoutLock(cartKey),
      getCart: () => getCart(cartKey),
      clearCart: () => clearCart(cartKey),
      startExecution: (name, input) =>
        sfn.send(new StartExecutionCommand({ stateMachineArn: STATE_MACHINE_ARN, name, input })),
      logError: (msg, detail) => console.error(msg, detail),
    },
  );
  return NextResponse.json(result.body, { status: result.status });
}
