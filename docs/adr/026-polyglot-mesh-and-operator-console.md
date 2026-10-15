# ADR 026 — Polyglot Service Mesh + Operator Console + Traffic Generator

**Status:** Accepted
**Date:** 2026-05-31
**Authors:** CloudOps platform

---

## Context

The platform's distinguishing value is the depth of its distributed-tracing
service map, not e-commerce. The storefront was framed as a shop (products,
cart, checkout, orders), which buried the real story: a multi-tenant,
event-driven, multi-runtime distributed system on EKS.

We wanted three things:
1. A **large, deep service map** — many small services, multiple languages,
   both server (long-running) and serverless (Lambda) compute, so one request
   fans out across 8–10 spans.
2. A **traffic generator** to drive that map continuously and on demand.
3. A frontend that **shows the live system** rather than selling products.

## Decision

**Reframe the storefront as an operator console and add a polyglot mesh + a
traffic generator.**

- **Mesh (`enable_mesh`).** Nine net-new single-purpose services, each in
  `apps/<name>/`, instantiated through one generic `modules/mesh` Terraform
  module:
  - sync chain: `api-gateway` (Node) → `pricing` (Go) → `inventory` (Python) →
    `fraud` (Java) → `payment` (Node) → `ledger` (Go);
  - async: `Kinesis → enrichment-lambda → EventBridge → analytics-lambda`
    (`modules/mesh-events`) and `Kinesis → projection-worker` (Python).
  - Every service exposes `/healthz` `/readyz` `/metrics`, is OTel-instrumented
    (no-op when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty), runs non-root with a
    read-only root FS, and pulls base images through the ECR cache.
  - Internal service-to-service POSTs reuse the order-api HMAC scheme.

- **Traffic generator (`enable_loadgen`).** `apps/loadgen` + `modules/loadgen`:
  a control-API Deployment plus a steady-trickle CronJob. The runner targets
  **only** the in-cluster `api-gateway` (target fixed at construction — the
  control API never accepts a URL), with rps/duration hard-clamped. Traffic is
  tagged synthetic.

- **Console.** `/console` `/services` `/traces` `/load` read the real Tempo
  metrics-generator (service graph) and Mimir (rps/error) through a
  Cognito-gated BFF (`/api/observe/*`, `/api/load/*`). No observability
  credentials reach the browser.

## Alternatives considered

1. **Re-skin the existing backend only** (keep one service, dress it up). Quick,
   but the service map stays tiny — defeats the goal.
2. **All-serverless mesh.** Cheapest at idle, but a Lambda-dominated graph reads
   as a function pipeline, not a microservice mesh, and weakens the sync
   deep-chain story.
3. **Single language (Node + Go only).** Less CI/coverage surface, but loses the
   polyglot-tracing demonstration that motivated the work.

We chose the polyglot server+serverless combination for the richest map at the
lowest per-service cost (each unit is tiny; dev runs 1 replica, HPA off).

## Consequences

- The shop UI + the `storefront-assets` upload pipeline were removed; the
  cart/checkout/search/events/realtime backend stays as synthetic load surface.
- The pipeline order gains `mesh` and `loadgen` stages after `database`.
- Real chaos engineering (pod-killing) is deliberately out of scope — the chaos
  scenario is app-level fault injection only (see backlog).
- mTLS service-to-service remains future work (#9); inter-service auth is HMAC +
  L4 NetworkPolicy for now.
