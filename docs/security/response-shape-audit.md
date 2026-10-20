# JSON Response-Shape Audit (#138)

Manual code-walk of every JSON response body returned to a client, checking for
PII / internal-token / internal-ID leakage. One row per endpoint with the
success-path response keys enumerated. Error bodies (`{ error, detail? }`) are
covered in aggregate at the end.

**Last refreshed:** 2026-06-02
**Scope:** `apps/order-api/src/app.ts` (every `res.json`) +
`apps/storefront/src/app/api/**/route.ts` (every `NextResponse.json`).
**Method:** trace each body back to its source SQL / upstream fetch / claims
object and list the leaf keys actually serialised to the caller.

Flag legend: ✅ clean · ⚠️ informational (intentional but worth recording) ·
🔴 leak (filed as a new row).

---

## order-api (`apps/order-api/src/app.ts`)

Every order body is built from `ORDER_SAFE_COLUMNS`
(`id, order_id, items, total, environment, tenant_id, created_at` — `app.ts:364`).
The sensitive column `owner_sub` is deliberately excluded from the SELECT, so it
can never reach a client. Product bodies use explicit column lists, not `SELECT *`.

| Method · Path | Response keys (success path) | Source | Flag |
|---|---|---|---|
| `GET /` | `service, version, environment, endpoints{...}` | static | ⚠️ exposes `environment` (e.g. `prod`) — non-secret, matches `/health` |
| `GET /health` | `status, environment, region, timestamp, uptime` | static / `process` | ⚠️ `environment`+`region` are non-secret deploy facts; standard health output |
| `GET /ready` | `status, timestamp` (or `status, error`) | static | ✅ |
| `GET /metrics` | _Prometheus text, not JSON_ | registry | ✅ scope note below |
| `POST /order` | `success, order{id, order_id, items, total, environment, tenant_id, created_at}` | `ORDER_SAFE_COLUMNS` | ⚠️ see ID note |
| `GET /orders` | `orders[]{...SAFE_COLUMNS}, count` | `ORDER_LIST(_OWNED)_SQL` | ⚠️ see ID note |
| `GET /orders/:orderId` | `success, order{...SAFE_COLUMNS}` | `ORDER_GET(_OWNED)_SQL` | ⚠️ see ID note |
| `GET /privacy/export` | `success, orders[], audit_events[], idempotency_keys[]` | `PRIVACY_EXPORT_*_SQL` | ⚠️ by-design: caller's OWN data (GDPR export, `owner_sub`/`actor_id` filtered to `req.user.sub`) |
| `POST /privacy/erase` | `success, erased{order_links, audit_actor_links, idempotency_keys}` | row counts | ✅ counts only |
| `GET /products` | `success, products[]{id, sku, name, description, price_cents, qty, image_key, created_at}, limit, offset` | `PRODUCT_LIST_SQL` | ⚠️ `id` is numeric (catalog ID, not a user/tenant ID) |
| `GET /products/:id` | `success, product{...same as list}` | `PRODUCT_GET_SQL` | ⚠️ same numeric catalog `id` |
| `POST /_internal/search` | `success, results[]{id, sku, name, price_cents, qty, image_key, rank}, limit` | `PRODUCT_SEARCH_SQL` | ✅ HMAC-gated, internal caller |
| `POST /_internal/admin/products` | `success, id` | INSERT RETURNING | ✅ HMAC-gated |
| `PUT /_internal/admin/products/:id` | `success, id` | UPDATE RETURNING | ✅ HMAC-gated |
| `DELETE /_internal/admin/products/:id` | `success, id` | DELETE RETURNING | ✅ HMAC-gated |

**ID note (⚠️, not a leak).** Order responses expose the row's surrogate `id`
(bigint) alongside the public `order_id` (UUID), and product responses expose a
numeric catalog `id`. The acceptance criterion flags "internal numeric IDs that
should be UUIDs to the client". Assessment: **acceptable, no change required.**

- The client-facing order handle is `order_id` (UUID) — every storefront route
  and `lib/api.ts` keys off `order_id`, never the bigint `id`. The bigint is
  inert to a caller (RLS scopes all reads to the caller's tenant, so it is not
  an IDOR vector) and is useful for support/debugging correlation.
- Product `id` is the documented catalog identifier the storefront's
  `getProduct(id)` / `addToCart` path is built around (`/api/cart` resolves a
  product by this `id`). It is not user- or tenant-derived.

If a future public/multi-tenant product surface ships, revisit dropping the
order bigint `id` from `ORDER_SAFE_COLUMNS`; for the current operator-console
shape it stays.

**`tenant_id` (⚠️, not a leak).** Order bodies echo the caller's own
`tenant_id`. This is the tenant the request was already authenticated against
(from the JWT/claim), never another tenant's — RLS guarantees the row belongs to
`req.tenantId`. Echoing it back is not disclosure.

**`/metrics` scope.** Prometheus exposition text, not JSON, so outside the
`res.json` walk. It is served on a separate internal metrics app
(`createMetricsApp`) and is not exposed on the public ALB. Counter label
cardinality (`jwt_verify_total{outcome}`, route labels) carries no PII.

---

## storefront BFF (`apps/storefront/src/app/api/**/route.ts`)

The observability + load routes are server-side proxies: upstream creds
(Tempo/Mimir/Loki bearer, loadgen HMAC) never reach the browser, and upstream
errors are collapsed to generic reasons (the #142 pattern).

| Method · Path | Response keys (success path) | Source | Flag |
|---|---|---|---|
| `GET /api/cart` | `items[]{sku, qty, name, price_cents, added_at}` or `count` | DynamoDB `getCart` | ✅ product display data only; cart `pk` (sub/guest-UUID) never returned |
| `POST /api/cart` | `success` | — | ✅ |
| `PATCH /api/cart/:itemId` | `success` | — | ✅ |
| `DELETE /api/cart/:itemId` | `success` | — | ✅ |
| `POST /api/checkout` | `orderId, startDate`; on failure `error, reason` (order-api's error code; its free-text detail is logged, not returned) | `lib/checkout.ts` | ✅ (F-138-1; detail passthrough removed 2026-10-20, #40) |
| `POST /api/ws-token` | `token, expires_in` | freshly minted HS256 JWT | ⚠️ by-design: caller's own 300s WS token, claims = `{sub, custom:tenant_id, token_use:ws}` (no email, no upstream secret) |
| `GET /api/privacy/export` | `exported_at, user{sub, email, tenant_id}, cart[], order_api{...}` | claims + order-api | ⚠️ by-design GDPR export of caller's own identity |
| `POST /api/privacy/delete` | `success, erased{...}, cleared{authenticated_cart_rows, guest_cart_rows, realtime_connections}` | row counts | ✅ counts only |
| `GET /api/observe/topology` | Tempo/Mimir service-graph payload | `fetchTopology()` | ⚠️ server-side telemetry (service names, edge rates); Cognito-gated; no PII, no creds |
| `GET /api/observe/metrics` | Mimir query payload | `lib/observe` | ⚠️ same trust note as topology |
| `GET /api/observe/traces` | `traces[]` or `{trace}` (Tempo spans) | `fetchRecentTraces` / `fetchTraceById` | ✅ admin-only since 2026-10-20 (F-138-2) |
| `POST /api/load/run` | passthrough loadgen body `{status/runId/...}` | loadgen | ✅ admin-gated; loadgen returns run stats only |
| `POST /api/load/stop` | passthrough loadgen body | loadgen | ✅ admin-gated |
| `GET /api/load/status` | passthrough loadgen body or `{running, configured}` | loadgen | ✅ |
| `POST /api/load/chaos` | passthrough loadgen body | loadgen | ✅ admin-gated |
| `GET /api/health` | `{status}` | static | ✅ |
| `GET /api/ready` | `{status,...}` | static | ✅ |

---

## Findings filed

### F-138-1 (P4) — checkout returns the Step Functions execution ARN + raw SDK error

`apps/storefront/src/app/api/checkout/route.ts`

1. Success body returns `executionArn` (`route.ts:114`). A Step Functions ARN
   embeds the **AWS account ID** and **region**
   (`arn:aws:states:<region>:<account-id>:execution:<sm>:<name>`). The browser
   only needs `orderId` to drive the confirmation UI; the ARN is internal infra
   metadata. Low severity (account ID is not a secret and the route is
   session-gated), but it is gratuitous disclosure.
2. The `start_execution_failed` branch returns `err.message` from the AWS SDK to
   the browser (`route.ts:119`) — the same class of upstream-error leak that
   #142 closed for the OAuth callback. Should collapse to a fixed reason and log
   the detail server-side.

**Fixed 2026-06-02 (same session).** `checkout/route.ts` now drops
`executionArn` from the success body (keeps `orderId` + `startDate`) and
collapses the `start_execution_failed` branch to a constant reason, logging the
real error via `console.error`. No remaining response-shape leak.

### F-138-2 (P2) — every signed-in user could read every tenant's traces

`apps/storefront/src/app/api/observe/traces/route.ts`

This audit first rated the route "span metadata only; no PII". It returns raw
Tempo spans: attributes, URLs and tenant IDs, from every tenant, and its list
hands out their trace IDs. It required a session, not admin, so any shopper
could read other tenants' requests. **Fixed 2026-10-20 (#40):** admin-only,
through the `requireAdmin()` gate the load routes use, with a test that fails
if an admin route is gated by session only. Aggregate metrics and the
topology carry no tenant data and stay open to signed-in users.

---

## Mesh services (added 2026-10-20)

In-cluster only: the api-gateway Service is ClusterIP and no Ingress routes to
it; the other services accept traffic only from the gateway or their caller.

| Service · Path | Response keys | Flag |
|---|---|---|
| api-gateway `POST /v1/order` | `status, total_cents, auth_id, entry_id, fraud_decision, hops{<hop>: {status, ok}}`; on failure `error, failed_hop?, hops` | ✅ per-hop status codes only, no downstream bodies |
| pricing `POST /quote` | `total_cents, lines[]` | ✅ |
| inventory `POST /reserve` | `reserved, lines[]{sku, qty, available, ok}` | ✅ |
| fraud `POST /score` | `score, decision` | ✅ |
| payment `POST /authorize` | `status, auth_id, entry_id` or `error` | ✅ |
| ledger `POST /entries` | the posted entry: `entry_id, auth_id, tenant_id, amount_cents, debit, credit, …` | ✅ HMAC-gated; returns to payment the entry it just posted |
| loadgen control API | run status, counters | ✅ HMAC-gated writes |

---

## Conclusion

order-api: **clean** — `ORDER_SAFE_COLUMNS` + explicit product column lists mean
no password/hash/salt/JWT/session-token/`owner_sub` field reaches any client.
storefront: **clean** after F-138-1 (checkout ARN and SDK error string, P4,
fixed 2026-06-02) and F-138-2 (every tenant's traces readable by any signed-in
user, P2, found in the 2026-10-20 review and fixed in #40).
Mesh: **clean**. #138 / BACKLOG O03 closed.
