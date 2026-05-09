<!-- This document explains 015 order API idempotency for CloudOps. -->
# ADR 015 — order-api Idempotency Semantics

**Status:** Accepted
**Date:** 2026-05-09
**Authors:** CloudOps platform

---

## Context

`POST /order` creates an order. Without retry safety, a client that
times out (network blip, ALB 504, deploy interruption mid-request) and
retries the request can create a duplicate row. Backlog #72 raised this
as a P2 reliability gap.

The choices were:

1. **Server-side dedup on payload hash only.** Drop a duplicate when a
   recent identical payload exists. Catches accidental double-clicks but
   not legitimate "same shape, different intent" cases — two real orders
   for the same SKU at the same price within seconds of each other.
2. **Stripe-style `Idempotency-Key` header.** Client controls the dedup
   token; server replays the original response when the same key + same
   payload comes back, and refuses with a conflict status when the key
   is reused for a different payload.
3. **Require a unique business identifier.** Force the client to supply
   its own order id and reject duplicates by primary key. Tightest
   semantics but pushes id generation onto every client and breaks the
   `ORD-<timestamp>-<random>` server-side scheme.

Option 1 is wrong: it can drop legitimate orders. Option 3 is correct
for first-party clients but bad for integrations we do not own. Option 2
is the standard SaaS pattern and matches the way most clients (Stripe
SDKs, AWS SDKs, Square, Shopify) already retry.

## Decision

Implement option 2.

Schema (`apps/order-api/migrations/004_idempotency_keys.sql`):

- `order_idempotency_keys` table keyed on `(tenant_id, idempotency_key)`.
- Stores `request_hash` (SHA-256 of the canonicalised body), the stored
  `status_code`, the stored `response_body` (JSONB), the `order_id` if
  resolved, and `expires_at`.
- RLS is FORCED on the table — same model as `orders` and
  `audit_events`. A row from tenant A is invisible to tenant B.

Server flow (`apps/order-api/src/app.ts`, inside the existing
`withTenant` transaction):

1. Read `Idempotency-Key` header. Optional. If present, validate against
   `^[\x21-\x7e]{1,255}$`; reject 400 on malformed.
2. Compute `request_hash` from the validated payload.
3. `INSERT ... ON CONFLICT DO NOTHING RETURNING tenant_id`. The PK +
   ON CONFLICT is the writer's race fence.
4. If the insert succeeded (`rowCount === 1`), proceed with the order
   create. After the order INSERT, `UPDATE order_idempotency_keys SET
   status_code, response_body, order_id` with the real response.
5. If the insert returned 0 rows (key already present), `SELECT ... FOR
   UPDATE` blocks until the in-flight writer commits, then:
   - request_hash matches → replay stored `(status_code, response_body)`.
   - request_hash differs → 409 `idempotency_conflict`.

Replay window is 24 hours. Cleanup is a future periodic
`DELETE WHERE expires_at < NOW()` (not in the initial implementation;
the table is small enough at current volume).

Scope:

- Applied only to `POST /order`. `GET /orders` is read-only.
- Tenant-scoped, never global. Same key under different tenants
  resolves to two independent rows.
- The audit log (#73) records both the original create and the replay
  outcome via the response status code that gets written to the audit
  table.

## Consequences

**Positive:**
- `POST /order` is now safe to retry without duplicating orders.
- Concurrency safety is enforced by Postgres (PK + FOR UPDATE), not by
  application locking. No coordination layer needed.
- Reuse with a different payload returns 409 instead of silently
  succeeding — the client learns about the misuse.
- RLS keeps idempotency rows tenant-scoped at the database layer.

**Negative:**
- The `Idempotency-Key` header is optional, so a client that never sends
  one gets the old behaviour. We accepted optional rather than required
  to avoid breaking the dev/test fallback path and to match how Stripe
  ramps clients into the feature.
- Body must be canonicalised the same way on every request. The hash
  function in `app.ts` (`hashOrderPayload`) only normalises field
  ordering for `items[i].sku`/`quantity`/`total`. If the schema grows,
  the hash function must grow with it or risk false 409s.
- Storage grows with key volume. The 24h TTL plus periodic cleanup keeps
  it bounded; the cleanup job is a follow-up.

**Revisit when:** the idempotency table grows unbounded (cleanup job
becomes a hard requirement), the API gains other state-changing endpoints
that need the same protection (lift the helper to a middleware), or a
customer requires idempotency to be mandatory rather than optional.
