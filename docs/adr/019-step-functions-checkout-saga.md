# ADR 019 — Step Functions Standard for Checkout Saga

**Status:** Accepted
**Date:** 2026-05-13
**Authors:** CloudOps platform

---

## Context

Checkout coordinates three side effects across systems: a write to
Postgres (`POST /order`), a Kinesis event publish (already implicit in
order-api #85), and an email enqueue. Each can fail; the workflow needs
to compensate (refund inventory, mark order cancelled) without
duplicating the order on retry.

Options:

1. **In-process Express transaction.** Wrap inventory + order +
   Kinesis + SQS inside a single `withTenant` transaction. Simplest
   path, but cross-system compensation has no native primitives —
   anything that fails post-commit becomes a forever-broken state.
2. **Step Functions Standard.** Durable execution history, native
   `Catch` blocks, visible state graph, idempotency via execution
   name + the existing `Idempotency-Key` plumbing on `POST /order`.
3. **Step Functions Express.** Higher TPS / lower cost, but ≤5 min
   wall-clock and no execution history. Wrong for a saga where the
   demo value is "we can see what happened".

## Decision

**Step Functions Standard.**

Rationale:
- Durable history shows up in the AWS console — the demo screenshot
  alone earns the cost.
- `Catch` + a `Compensate` branch is the textbook saga pattern.
- Idempotency: execution name is the storefront-side hash; running
  the saga twice with the same name returns the same execution.
- `arn:aws:states:::http:invoke` calls Express directly with the
  execution name as `Idempotency-Key` — the order-api's existing
  idempotency table (#72) deduplicates retries.
- Standard's per-state-transition pricing is comfortably in budget
  at portfolio-demo traffic.

## Consequences

- Inventory reservation today is a placeholder — `products.qty`
  exists but no atomic DECR endpoint. Until that lands, the saga has
  one task (`CreateOrder`) plus the email enqueue.
- Step Functions execution log retention is 14 days by default; long
  audits live in `audit_events` (#73) instead.

## Alternatives rejected

- **In-process transaction:** no native compensation across systems.
- **Step Functions Express:** loses the demo asset (visible history).
