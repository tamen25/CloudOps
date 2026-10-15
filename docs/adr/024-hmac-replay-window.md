# ADR 024 — Internal HMAC: accept 5-minute replay window without a nonce cache

**Status:** Accepted
**Date:** 2026-05-14
**Closes:** backlog #108

## Context

`/_internal/*` endpoints on `order-api` are gated by HMAC-SHA256 over
`${timestamp}.${tenant}.${body}.${secret}`. The server accepts any request
whose `x-cloudops-timestamp` is within `±5 minutes` of `Date.now()`
(`apps/order-api/src/app.ts:464`).

This means an attacker who captures one valid request can replay it
verbatim for up to 5 minutes — same body, same signature, same outcome
(idempotency-key collision aside).

The standard mitigation is a nonce cache: every accepted `(tenant,
timestamp, hmac)` tuple is stored for ≥ the replay window, and any repeat
is rejected. Backlog #108 asked: add such a cache, or accept the risk and
document why.

## Decision

**Accept the 5-minute replay window. Do not add a nonce cache yet.**

Add an inline comment at the replay-window check pointing here, and
record the triggers that would force us to revisit.

## Rationale

1. **The callers are server-to-server, not browser.** `/_internal/search`
   and `/_internal/admin/products` are reached only by the storefront
   Next.js process (RSC routes) running inside the same VPC. There is no
   public exposure of these endpoints — they are blocked at the ALB +
   NetworkPolicy + Origin check layers. An attacker would already need to
   be in-cluster or in-VPC to capture a request.

2. **Replay is not privilege escalation.** A captured request can only
   replay the operation the original caller authorised. There is no way
   to forge a *new* request body without the secret. The worst-case is
   a duplicate write of the *same* product update or the *same* search
   query within 5 minutes.

3. **Idempotency mitigates writes.** Write endpoints
   (`/_internal/admin/products`) take an effective uniqueness contract
   (SKU, product id). A replayed create returns 409 on duplicate SKU;
   a replayed update is functionally a no-op (re-writes the same
   columns). Search replay is a read — no state change.

4. **Operational cost.** A nonce cache needs durable, low-latency
   storage shared across all order-api replicas. Redis is the obvious
   choice but adds an HA dependency, a connection pool, and a failure
   mode (cache down → reject all internal traffic OR fail open).
   Dynamo works but adds round-trip latency to every `/_internal/*`
   call. Neither is justified by the residual risk above.

5. **HMAC secret rotation already shrinks the window.** #96 added
   dual-accept rotation. The 5-min replay window is bounded by the
   *secret's* lifetime — rotating the secret revokes any captured
   request, even within the timestamp window.

## Compensating controls in place

- **Timestamp skew window** (±5 min) limits the replay duration.
- **Origin check** (#97) blocks browser-originated cross-site requests.
- **NetworkPolicy** — only the storefront pod can reach order-api
  on the internal port.
- **HMAC secret rotation** (#96) — dual-accept window.
- **Audit log** — every `/_internal/*` write is recorded in
  `audit_events` with `tenant_id, actor, request_hash`. A replay
  shows up as a duplicate audit row, detectable post-hoc.
- **Per-tenant rate limit** (#45) — caps replay throughput.

## Triggers to revisit (add the nonce cache)

Revisit this ADR — and add a Redis/Dynamo nonce cache — if any of
these become true:

- `/_internal/*` is exposed beyond the storefront's internal VPC path.
- Audit log detects unexplained duplicate `request_hash` rows.
- A capture-and-replay attack vector becomes credible (e.g., a side
  channel that leaks raw request bytes from observability).
- Compliance audit requires explicit anti-replay guarantees.

## Implementation note

The replay-window check in `apps/order-api/src/app.ts` is annotated with
a pointer to this ADR so future readers see the trade-off without having
to dig through git blame.
