# Storefront review — 2026-10-20

Scope: `apps/storefront`, the Next.js operator console and shop BFF (R01 in
`BACKLOG.md`). The server side (API routes, middleware, `lib/`, about 2,200
lines) was read in full. The UI components (about 6,500 lines) were swept
for client-side risks: raw HTML injection, `eval`, links built from input,
`target="_blank"` without `rel`, and secrets or tokens reaching the browser.
The sweep found none.

## Fixed in this PR

| ID | Finding |
|---|---|
| SF-1 | **Any signed-in user could read every tenant's traces.** `/api/observe/traces` required a session, not admin. It returns raw Tempo spans (attributes, URLs, tenant IDs), and its list hands out trace IDs from all tenants. It now requires the admin group, like the load routes. Aggregate service metrics and the topology carry no tenant data and stay open to signed-in users. One `requireAdmin()` gate is shared by every admin route, and a test fails if one of them loses it. |
| SF-2 | **Checkout left the cart in place.** After an order, the same cart checked out again replayed that order (the idempotency key is derived from the cart) and failed to start a second workflow of the same name. The cart is now cleared once the workflow has started. A failed order or start keeps it. |
| SF-3 | **Checkout returned order-api's free-text error detail** (it can carry SQL or upstream messages). The error code is returned; the detail is logged. |
| SF-4 | **Privacy erasure could leave realtime connections open.** `deleteUserConnections` read one page of the tenant index, whose subject filter runs per page. It now reads every page. |
| SF-5 | **The rate limiters never forgot a client.** Each distinct IP or user added an entry for the life of the pod. Past 50,000 keys, expired entries are swept, then the oldest dropped. |
| SF-6 | **No timeouts** on the order-api, search and token-exchange calls. Each is now bounded at 10 s. |

The checkout flow moved from the route handler to `lib/checkout.ts` with its
I/O injected, so it is tested without Next, DynamoDB or Step Functions; the
route resolves the session and the cart. Each fix has a test that fails
without it.

## Reviewed, no change

- **Auth.** The OAuth callback checks state, uses PKCE, accepts only
  same-origin post-login paths and collapses errors to a fixed list.
  Sessions are verified for issuer and audience against the JWKS.
- **Cart.** Prices and names come from the catalog server-side, never the
  client; quantity is bounded. Checkout holds a conditional lock.
- **Client IP.** Rate limiting takes the ALB-appended right-most
  `X-Forwarded-For` hop, which a client cannot spoof.
- **Load generator routes.** Admin-only and signed; the target is fixed.

## Open

- **SF-7, repeat purchases within 24 hours.** The idempotency key is
  derived from the cart contents, so buying the identical cart again within
  order-api's 24-hour idempotency window replays the earlier order. Fixing
  it needs a per-attempt key from the checkout UI. There is no checkout or
  cart page yet; the API has no caller in the UI. Decide when that page is
  built.
- **SF-8, per-pod rate limits.** The limiters are in memory, so each
  replica keeps its own counts: N replicas allow N times the configured
  rate. A shared store (Redis, DynamoDB) is needed if the limit must be
  exact.
