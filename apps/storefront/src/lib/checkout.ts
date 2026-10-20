// Checkout: turn a locked cart into an order and start its workflow. The
// route handler (app/api/checkout/route.ts) resolves the session and the
// cart; everything after that lives here, with its I/O injected so it can be
// tested without Next, DynamoDB, order-api or Step Functions.
import { createHash } from "node:crypto";
import type { CartItem } from "@/lib/cart";

// order-api creates an order in well under a second; past this the shopper
// gets an error instead of a hung request.
const ORDER_TIMEOUT_MS = 10_000;

export interface CheckoutDeps {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  getCart: () => Promise<CartItem[]>;
  clearCart: () => Promise<unknown>;
  startExecution: (name: string, input: string) => Promise<{ startDate?: Date }>;
  logError: (msg: string, detail: unknown) => void;
}

export interface CheckoutUser {
  session: string; // the verified ID token, forwarded to order-api
  sub: string;
  tenant: string;
  email?: string;
}

export interface CheckoutResult {
  status: number;
  body: Record<string, unknown>;
}

export async function checkout(user: CheckoutUser, deps: CheckoutDeps): Promise<CheckoutResult> {
  /* Closes backlog #128 — lock the cart before reading items so a
     concurrent add-to-cart cannot change the hash between hash-compute
     and SF StartExecution. The lock auto-expires after 60s in case the
     handler crashes mid-checkout. */
  if (!(await deps.acquireLock())) {
    return { status: 409, body: { error: "checkout_in_progress" } };
  }
  try {
    const cartItems = await deps.getCart();
    if (cartItems.length === 0) {
      return { status: 400, body: { error: "cart_empty" } };
    }
    const items = cartItems.map((it) => ({ sku: it.sku, quantity: it.qty }));
    const total =
      Math.round(cartItems.reduce((sum, it) => sum + it.price_cents * it.qty, 0)) / 100;

    const cartHash = createHash("sha256")
      .update(JSON.stringify({ tenant: user.tenant, items, total }))
      .digest("hex")
      .slice(0, 32);
    const executionName = `${user.sub.slice(0, 16)}-${cartHash}`;

    // Create the order while the user's JWT is still present. The old design
    // let Step Functions call POST /order with only X-Tenant-Id, which meant
    // the API had to accept anonymous tenant-scoped writes. Keep the durable
    // workflow for post-order side effects, but make the protected business
    // write user-authenticated and idempotent here.
    const orderRes = await deps.fetchImpl(`${deps.apiBaseUrl}/order`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${user.session}`,
        "content-type": "application/json",
        "idempotency-key": executionName,
      },
      body: JSON.stringify({ items, total }),
      cache: "no-store",
      signal: AbortSignal.timeout(ORDER_TIMEOUT_MS),
    });
    const orderBody = (await orderRes.json().catch(() => null)) as
      | { order?: { order_id?: string }; error?: string; detail?: string }
      | null;
    const orderId = orderBody?.order?.order_id;
    if (!orderRes.ok || !orderId) {
      // order-api's error code is safe to show; its free-text detail is not
      // (it can carry SQL or upstream messages), so it is logged instead.
      deps.logError("checkout create order failed", {
        status: orderRes.status,
        error: orderBody?.error,
        detail: orderBody?.detail,
      });
      return {
        status: orderRes.status >= 400 && orderRes.status < 500 ? orderRes.status : 502,
        body: { error: "create_order_failed", reason: orderBody?.error ?? null },
      };
    }

    let started: { startDate?: Date };
    try {
      started = await deps.startExecution(
        executionName,
        JSON.stringify({ tenant_id: user.tenant, order_id: orderId, items, total, email: user.email ?? "" }),
      );
    } catch (err) {
      // Collapse the raw SDK error to a fixed reason (mirror of #142) — log the
      // detail server-side instead of leaking it to the browser.
      deps.logError("checkout StartExecution failed", err);
      return { status: 500, body: { error: "start_execution_failed" } };
    }

    // The order exists and its workflow has started: the cart has done its
    // job. Left in place, a second checkout of it replays this order (same
    // idempotency key) and fails to start a workflow of the same name.
    await deps.clearCart().catch((err) => deps.logError("checkout clear cart failed", err));

    // Do not return the executionArn — a SFN ARN embeds the AWS account ID +
    // region (internal infra metadata). The confirmation UI only needs the
    // orderId. (Closes #138 / F-138-1.)
    return { status: 200, body: { orderId, startDate: started.startDate?.toISOString() ?? null } };
  } finally {
    await deps.releaseLock();
  }
}
