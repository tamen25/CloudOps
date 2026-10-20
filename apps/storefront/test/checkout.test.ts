// Checkout turns a locked cart into an order and starts its workflow. The
// cart, order-api and Step Functions are fakes; the calls they get are
// recorded.
import test from "node:test";
import assert from "node:assert/strict";
import { checkout, executionNameFor, type CheckoutDeps } from "../src/lib/checkout";

const USER = { session: "id-token", sub: "user-1", tenant: "t1", email: "a@example.com" };
const ITEMS = [{ sku: "A", qty: 2, name: "A", price_cents: 150 }];

function deps(over: Partial<CheckoutDeps> & { order?: { status: number; body: unknown } } = {}) {
  const calls: string[] = [];
  const order = over.order ?? { status: 201, body: { order: { order_id: "o-1" } } };
  const d: CheckoutDeps = {
    apiBaseUrl: "http://order-api.test",
    fetchImpl: (async () => {
      calls.push("order");
      return new Response(JSON.stringify(order.body), { status: order.status });
    }) as unknown as typeof fetch,
    acquireLock: async () => { calls.push("lock"); return true; },
    releaseLock: async () => { calls.push("unlock"); },
    getCart: async () => ITEMS as never,
    clearCart: async () => { calls.push("clear"); },
    startExecution: async () => { calls.push("start"); return { startDate: new Date(0) }; },
    logError: () => {},
    ...over,
  };
  return { d, calls };
}

// The cart used to stay after checkout, so checking it out again replayed
// the same order (same idempotency key) and could not start a second
// workflow of the same name.
test("a completed checkout clears the cart, after the workflow has started", async () => {
  const { d, calls } = deps();
  const res = await checkout(USER, d);
  assert.equal(res.status, 200);
  assert.equal(res.body.orderId, "o-1");
  assert.deepEqual(calls, ["lock", "order", "start", "clear", "unlock"]);
});

test("a failed order or workflow start keeps the cart", async () => {
  for (const over of [
    { order: { status: 500, body: { error: "db_down" } } },
    { startExecution: async () => { throw new Error("ExecutionAlreadyExists"); } },
  ] as Partial<CheckoutDeps>[]) {
    const { d, calls } = deps(over);
    const res = await checkout(USER, d);
    assert.ok(res.status >= 500, JSON.stringify(res));
    assert.ok(!calls.includes("clear"), "cart cleared after a failure");
    assert.equal(calls.at(-1), "unlock");
  }
});

// order-api's free-text detail can carry SQL or upstream messages.
test("order-api's error detail is logged, not returned", async () => {
  const logged: unknown[] = [];
  const { d } = deps({
    order: { status: 422, body: { error: "price_changed", detail: "select * from products where tenant_id = 't1'" } },
    logError: (_m, detail) => logged.push(detail),
  });
  const res = await checkout(USER, d);
  assert.equal(res.status, 422);
  assert.deepEqual(res.body, { error: "create_order_failed", reason: "price_changed" });
  assert.match(JSON.stringify(logged), /select \*/);
});

test("the order request is the user's, idempotent, and bounded in time", async () => {
  let init: RequestInit | undefined;
  const { d } = deps({
    fetchImpl: (async (_url: string, i: RequestInit) => {
      init = i;
      return new Response(JSON.stringify({ order: { order_id: "o-1" } }), { status: 201 });
    }) as unknown as typeof fetch,
  });
  await checkout(USER, d);
  const headers = init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer id-token");
  assert.match(headers["idempotency-key"], /^user-1-[0-9a-f]{32}$/);
  assert.ok(init?.signal, "no timeout on the order request");
});

test("a cart already being checked out is a 409 and touches nothing", async () => {
  const { d, calls } = deps({ acquireLock: async () => false });
  const res = await checkout(USER, d);
  assert.equal(res.status, 409);
  assert.deepEqual(calls, []);
});

// SF-7: a key derived from the cart made an identical cart, bought again
// within order-api's 24 h idempotency window, replay the first order.
test("with a client attempt key, the same cart bought twice is two checkouts", () => {
  const items = [{ sku: "A", quantity: 2 }];
  const first = executionNameFor({ ...USER, attemptKey: "attempt-0001" }, items, 3);
  const second = executionNameFor({ ...USER, attemptKey: "attempt-0002" }, items, 3);
  const retry = executionNameFor({ ...USER, attemptKey: "attempt-0001" }, [{ sku: "B", quantity: 1 }], 9);
  assert.notEqual(first, second);
  assert.equal(first, retry, "a retried submit of one attempt is the same checkout");
  assert.match(first, /^user-1-[0-9a-f]{32}$/);
});

test("without a usable attempt key, the key comes from the cart", () => {
  const items = [{ sku: "A", quantity: 2 }];
  const none = executionNameFor(USER, items, 3);
  assert.equal(executionNameFor({ ...USER, attemptKey: "bad key with spaces" }, items, 3), none);
  assert.notEqual(executionNameFor(USER, [{ sku: "B", quantity: 1 }], 3), none);
});
