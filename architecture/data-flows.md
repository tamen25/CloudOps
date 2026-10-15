<!-- Verified data-flow map for CloudOps. Source of truth for the storefront
     architecture graphs (ArchitectureFlow + FullArchDiagram). Re-verify against
     the cited files if those change, rather than re-scanning the whole repo. -->
# CloudOps Data Flows (verified)

Last verified: 2026-06-07 against the source files cited per flow.

This document is the ground truth behind the two architecture graphs in the
storefront:
- `apps/storefront/src/components/site/ArchitectureFlow.tsx` — the 4-lane flow diagram (`#architecture`).
- `apps/storefront/src/components/site/FullArchDiagram.tsx` — the full-picture node graph (`#architecture-full`).

Both render on `apps/storefront/src/app/architecture/page.tsx`.

## Services (apps/) and languages

| Service | Lang | Role |
|---|---|---|
| `api-gateway` | Node/TS | Mesh BFF; fans out `place-order` across the polyglot mesh |
| `pricing` | Go | Quote leg (`/quote`) |
| `inventory` | Python | Reserve leg (`/reserve`) |
| `fraud` | Java | Score leg (`/score`) |
| `payment` | Node/TS | Authorize charge (`/authorize`), then HMAC-posts to ledger |
| `ledger` | Go | Post balanced entry (`/entries`) |
| `order-api` | Node/TS | Express order service; RLS, idempotency, audit, Kinesis publish |
| `projection-worker` | Python | Second Kinesis consumer; builds in-memory read model |
| `storefront` | Node/TS | Next.js storefront + operator console |
| `loadgen` | Node/TS | Synthetic traffic driver (chaos-gated) |

## Flow 1 — Mesh fan-out (`#mesh`)

Synthetic `place-order` crosses six languages.

```
loadgen → api-gateway /place-order
        → pricing /quote        (Go,     authoritative total_cents)
        → inventory /reserve    (Python, reserve stock)
        → fraud /score          (Java,   risk decision; "deny" → 403)
        → payment /authorize    (Node)
                → ledger /entries (Go, HMAC-signed: sha256(ts.tenant.body.secret))
```

- Source: `apps/api-gateway/src/app.ts` (sequential hops 1–4), `apps/payment/src/app.ts` (payment→ledger), `apps/payment/src/hmac.ts`.
- Note: `ledger` is **not** a direct api-gateway hop — `payment` calls it. The graph draws it as the terminal node, which is correct.
- Downstream URLs from env: `PRICING_URL`, `INVENTORY_URL`, `FRAUD_URL`, `PAYMENT_URL` (`apps/api-gateway/src/server.ts`), `LEDGER_URL` (`apps/payment/src/server.ts`).

## Flow 2 — Async events (`#realtime`)

Post-commit fan-out off the order-event stream.

```
order-api POST /order → Kinesis (tenant-partitioned, PutRecord)
        → enrichment λ  (Kinesis event-source-mapping)
        → EventBridge bus (mesh)
        → analytics λ   (EventBridge target → CloudWatch EMF metrics, namespace CloudOps/Mesh)
```

- Source: `apps/order-api/src/kinesis.ts` (publisher; post-commit, best-effort), `modules/mesh-events/main.tf` (enrichment ESM + EventBridge bus + analytics target), `modules/mesh-events/lambdas/analytics/index.mjs` (EMF — **not** "rollups").
- Failure handling: a Kinesis publish failure writes `audit_events.result='kinesis_publish_failed'` (does not roll back the order).

## Flow 3 — Projection read (`#search`)

CQRS-style second consumer of the same stream.

```
Kinesis (same stream) → projection-worker (Python poller, LATEST shard iterators)
                      → in-memory read model (per-tenant dict, not a DB)
```

- Source: `apps/projection-worker/src/projection/poller.py`, `.../readmodel.py` (`ReadModel` is an in-memory dataclass keyed `by_tenant`).
- IMPORTANT: the operator **console does NOT read this projection.** The `/console` topology graph is fed by the **Tempo metrics-generator (via Mimir)** — see `apps/storefront/src/app/api/observe/topology/route.ts` and `.../lib/observe.ts`. Do not draw `read model → console`.

## Flow 4 — Checkout saga (`#saga`)

The order is created BEFORE the state machine starts; the SF workflow only enqueues the email.

```
storefront /api/checkout → order-api POST /order   (create; Idempotency-Key; RLS write)
                         → Step Functions (STANDARD, single state: EnqueueEmail)
                         → SQS email queue          (durable buffer; DLQ maxReceiveCount=3)
                         → email λ                  (SQS ESM; sends via SESv2 when SES_SOURCE_EMAIL set)
```

- Source: `modules/storefront-checkout/step_functions.tf` (the SM has exactly ONE state, `EnqueueEmail` → `sqs:sendMessage` → `End`), `modules/storefront-checkout/sqs.tf`, `.../lambdas/email/`, `apps/storefront/src/app/api/checkout/route.ts` (StartExecution).
- The SM does **not** contain a CreateOrder/HTTP-invoke state, a Postgres state, or an Audit state. Those happen inside `order-api` before/around the execution, not within the saga.

## Sync request path (FullArchDiagram only)

```
browser / mobile → ALB + WAF → { storefront pod | order-api pod | api-gateway }
storefront → Cognito (PKCE, custom:tenant_id)
order-api  → RDS Postgres (RLS FORCE) and Kinesis
```

- Source: `apps/storefront/src/middleware.ts`, `apps/storefront/src/lib/bff-auth.ts`, `apps/order-api/src/app.ts` (`withTenant` RLS wrapper), `modules/auth/`.

## Observability path

```
storefront / order-api / api-gateway → OTel Collector (OTLP) → { Mimir (metrics) | Loki (logs) | Tempo (traces + service graph) }
CloudWatch (AWS/RDS, ALB, NATGW, Lambda, Kinesis, Step Functions) → yace → Prometheus → Mimir
{ Mimir | Loki | Tempo } → Grafana (dashboards + alerting)
Tempo metrics-generator → Mimir → /console service-map topology
```

- App telemetry source: each app's `src/tracing.ts` (OTLP exporters), `modules/observability/`.
- yace (`modules/observability/yace.tf`): Helm "yet-another-cloudwatch-exporter"; scrapes CloudWatch, exposes Prometheus metrics auto-discovered by the kube-prometheus-stack ServiceMonitor. Gated by `var.enable_yace`. IRSA: `system:serviceaccount:monitoring:yace`.
- Grafana (`modules/observability/grafana.tf`): auto-provisioned datasources Prometheus/Mimir, Loki, Tempo; dashboards via sidecar; SLO alerts.
- Console topology source: `apps/storefront/src/app/api/observe/topology/route.ts` (Tempo metrics-generator via Mimir).

## Client libraries (NOT a runtime flow)

`libraries/{nodejs,java,dotnet,python,go,cpp}` are OTel client libraries (logs/metrics/traces)
published to **AWS CodeArtifact** for downstream consumers. Verified: the in-repo apps do
**not** import them (zero references in `apps/*/package.json` / source). Represent them as a
separate "published artifacts / SDK" node outside the request path — never as a live
dependency edge into the apps.

- Source: `libraries/README.md`, per-language `libraries/<lang>/<signal>/`.

## Graph-accuracy notes (what was corrected 2026-06-07)

- `ArchitectureFlow` saga lane rewritten: was a 6-node chain implying Postgres + Audit live inside the SF saga; now reflects the real single-state EnqueueEmail workflow with the order created in the storefront route first.
- `ArchitectureFlow` search lane: dropped the misleading `read model → console` edge (console reads Tempo/Mimir, not the projection); read model marked in-memory/compute rather than a database.
- analytics λ description corrected from "rollups" to "EMF metrics" in both graphs.
- Mesh and observability lanes verified accurate, no change needed.

## Additions 2026-06-07 (round 2)

- Both graphs gained the CloudWatch → yace → Prometheus path and Grafana as the dashboards/alerting consumer of Mimir/Loki/Tempo.
- `FullArchDiagram`: added `cloudwatch`, `yace`, `grafana` runtime nodes (with edges) and a dashed, edge-less `libraries` node (non-runtime SDK). viewBox grew 610→700 for the new Grafana row. Fixed `mesh-events` sub-text overflow (shortened to `enrich → EB → λ`).
- `ArchitectureFlow`: added an `#observability` lane (services+AWS → OTel·yace → Mimir/Loki/Tempo → Grafana); header copy now "five flows"; libraries shown as a dashed "not a runtime flow" footnote, not a lane.

## Generated AWS diagrams (round 3)

- `architecture/generate_diagrams.py` renders 11 PNGs to `architecture/diagrams/` using the Python `diagrams` lib + Graphviz (`C:\Program Files\Graphviz\bin`). Official icons: AWS set, native Grafana/Mimir/Loki/Tempo, official OpenTelemetry icon (`architecture/icons/opentelemetry.png`, Custom node), Prometheus for yace.
- Diagrams: 01 mesh, 02 async events, 03 projection, 04 saga, 05 observability, 06 full architecture (compact ~16:9), 07 networking, 08 security, 09 data layer, 10 CI/CD app (app.yml), 11 CI/CD infra (infra.yml).
- Labels use the word "lambda" (not the λ symbol); font = Arial for legibility.
- Hosted in the storefront at `/diagrams` (`apps/storefront/src/app/diagrams/page.tsx` + `DiagramGallery.tsx`); PNGs copied to `apps/storefront/public/diagrams/`. Footer + header nav link to it. Re-copy after regenerating: `cp architecture/diagrams/*.png apps/storefront/public/diagrams/`.
- Each diagram card + lightbox carries a `logic` (why built this way) and `challenge` (the hard part) explanation, sourced from this file. Grid spans are matched to each PNG's aspect ratio so rows don't leave dead space.
- Full-architecture PNG uses curved splines (not ortho) with generous spacing; CI/CD is a standalone side cluster (no cross-diagram deploy edge) like the client-libraries node. The interactive FullArchDiagram keeps rounded Bézier edges.
