# Distributed Polyglot Mesh + Observability Console + Traffic Generator

**Date:** 2026-05-31
**Status:** Approved (design), pending spec review
**Branch:** `feature/storefront-and-api-rework`

## Goal

Drop the e-commerce "store" framing. Turn the platform into what it already
nearly is under the hood: a **large-scale distributed system** whose
distinguishing feature is the size and depth of its **distributed-tracing
service map**. Add as many small, purpose-built services as practical — across
multiple languages and across both server (long-running) and serverless
(Lambda) compute — so one synthetic request fans out across 8–10 services.
Replace the shop UI with an **operator console** that renders the real service
map / traces / metrics from the existing observability stack, and ship a
**traffic generator** (live UI control + scheduled trickle) that keeps the map
lit and lets us load/chaos-test on demand.

Primary success metric: **a big, deep, real service map** populated by real
synthetic traffic, viewable in the app.

## Non-goals

- Not an e-commerce product. No human-facing cart/checkout/catalog UI.
- Not real chaos engineering (pod-killing) in v1 — app-level fault injection
  only. Real chaos filed to backlog.
- Not per-customer/per-account tokens, not a new auth system.
- Does not change Route 53 / ALB ownership, the S3 backend, the ECR
  pull-through cache, or any do-not-break tripwire in the project guide.

## Cost posture

Dev/test platform torn down nightly. Every new service runs **1 replica**, tiny
requests/limits (~32–64Mi / 25m CPU), HPA off in dev. Lambdas are
pay-per-invoke; the trickle CronJob keeps invocation volume tiny. All new
resources live in the **rebuilt-nightly tier** (not bootstrap/dns). Net added
footprint ≈ one order-api-sized workload, not 9×, because each unit is minimal.

---

## Section 1 — Service mesh (the core)

### Topology

```
SYNCHRONOUS CHAIN (one synthetic "place order"):

  loadgen ──▶ api-gateway (Node) ──▶ order-api (Node, EXISTING)
                  │                        │
                  ├──▶ pricing (Go) ───────┤
                  ├──▶ inventory (Python) ─┤
                  ├──▶ fraud (Java) ───────┤
                  └──▶ payment (Node) ──▶ ledger (Go)
                                            │
                  ┌─────────────────────────┘
                  ▼  (post-commit, EXISTING async plumbing)
ASYNC / SERVERLESS FAN-OUT:
  order-api ──▶ Kinesis ──▶ projection-worker (Python svc)   [read model]
            └──▶ Kinesis ──▶ enrichment-lambda ──▶ EventBridge
                                  ├──▶ notification path ──▶ email-lambda (EXISTING)
                                  └──▶ analytics-lambda (per-tenant rollups)
            └──▶ Step Functions checkout saga (EXISTING) ──▶ websocket-push (EXISTING)
```

### Net-new services (9)

| Service | Lang | Compute | Purpose | One job |
|---|---|---|---|---|
| api-gateway | Node | Deployment | edge entry, fan-out orchestration, trace root | route + aggregate |
| pricing | Go | Deployment | quote price for SKUs | price calc |
| inventory | Python | Deployment | stock check / reserve | availability |
| fraud | Java | Deployment | risk score a request | score |
| payment | Node | Deployment | authorize payment | auth + call ledger |
| ledger | Go | Deployment | double-entry record | append entry |
| projection-worker | Python | Deployment (Kinesis consumer) | build read model from events | materialize |
| enrichment-lambda | Node | Lambda (Kinesis→EventBridge) | enrich + route events | transform/route |
| analytics-lambda | Node | Lambda (EventBridge) | per-tenant rollups | aggregate |

### Conventions every service follows

- **OTel instrumentation** reusing `libraries/{go,python,java,nodejs}` ports.
  W3C `traceparent` propagated on every hop so one request = one trace tree.
- `/healthz` + `/readyz`, graceful shutdown on SIGTERM, structured logging with
  the same redaction policy as `apps/order-api/src/logger.ts`.
- Images via the **ECR pull-through cache** (`ecr-public` prefix) — nodes have
  no NAT (the project guide guardrail #3).
- Internal-only service-to-service calls are **HMAC-gated** (same pattern as
  order-api `/_internal/*`) or mTLS-deferred (#9). No service is publicly
  exposed except via the api-gateway / ingress.
- Self-contained under `apps/<name>/` with its own Dockerfile, k8s manifests,
  tests, and (for Node) the env-var contract-check.

### Isolation

Each service has one clear purpose, a documented interface (its HTTP/event
contract), and explicit dependencies (which downstreams it calls). A reviewer
can understand any service without reading another's internals.

---

## Section 2 — Frontend console

### Routes

```
KEEP (untouched):  /  /platform  /architecture  /pipeline  /design  /cookies
                   /privacy + /api/privacy/*  auth/*  login/*
REMOVE:            /products  /products/[id]  /cart  /checkout
                   /checkout/success  /orders  /orders/[id]  /admin/*
NEW:
  /console     live service map (force-graph) + global metrics strip
  /traces      recent traces list -> span-tree waterfall
  /services    per-service health grid (up, rps, p95, err, version, lang)
  /load        traffic generator control (Section 3)
```

### Data path (BFF)

```
console page (RSC) ──▶ /api/observe/{topology,metrics,traces,logs}  (storefront route handlers)
                            │  server-side only, never exposes creds to browser
                            ├──▶ Tempo  HTTP API  (service graph + trace by id)
                            ├──▶ Mimir/Prometheus  (instant + range queries)
                            └──▶ Loki   (recent log lines)
```

- BFF routes run server-side, **Cognito-gated** (same session model as today),
  hit in-cluster Tempo/Mimir/Loki service DNS. No observability creds reach the
  browser.
- **Live refresh: poll the BFF for topology/traces (every few seconds, with
  brief server-side caching); reuse the existing WebSocket only for the
  headline metrics strip.**
- Visuals built with **frontend-design** to match the existing dark/aurora
  landing aesthetic — console feels like the same product, not a bolted-on
  Grafana clone.

### Component disposition

- KEEP all `site/*` components, `ui/*` primitives, aurora/backdrop, `/design`.
- REMOVE shop components: ProductCard, ProductGrid, CartView, CheckoutButton,
  AddToCartButton, OrderStatusPill, Pagination, SearchBar, admin/ImageUploader.
- Navbar: replace commerce cluster with a console cluster
  (Console / Traces / Services / Load); keep platform cluster.

---

## Section 3 — Traffic generator

### Components

```
loadgen service (Node Deployment, in-VPC)   -> originates traffic, hits api-gateway
  - internal control API: POST /run {scenario, rps, durationSec}, POST /stop, GET /status
  - token-bucket worker pool drives the rps dial (no blind spamming)
  - every request carries W3C traceparent -> full internal trace attributable
  - emits OTel spans + loadgen_requests_total / loadgen_inflight metrics

/load page (frontend) ──▶ /api/load/* (BFF, Cognito-gated, HMAC to loadgen)
  scenario: [ browse | place-order | burst | mixed | chaos ]
  target rps: dial   duration: field
  [ Start ] [ Stop ]   live: rps · p95 · err · inflight (from /api/observe)

CronJob "loadgen-trickle" (k8s) ──▶ steady low rps (2–5) mixed scenario
  - keeps the service map populated when idle; /console never empty
  - no-op if api-gateway unreachable (cluster down)
```

### Scenarios

- `browse` — read-heavy (catalog/pricing/inventory reads), shallow, high rps.
- `place-order` — full deep chain across all 9 services + async fan-out. The
  map-lighting scenario.
- `burst` — short spike to exercise autoscaling / SLO / error-rate reaction.
- `mixed` — realistic blend; default for the trickle CronJob.
- `chaos` — app-level fault injection (bad payloads, forced downstream 500) so
  error edges turn red and alerts fire. **No pod-killing in v1.**

### Safety rails

- loadgen targets **only** the in-cluster api-gateway DNS — cannot be pointed at
  arbitrary URLs (no SSRF foot-gun).
- Control API HMAC-gated; BFF Cognito-gated; **rps and duration clamped** to
  safe ceilings; **hard cap** on max rps and max concurrent run (ties to FinOps
  #139).
- All synthetic traffic tagged: dedicated **synthetic tenant IDs**
  (`tenant_id=synthetic-*`) + `x-synthetic: 1` header, so DB rows / read model /
  ledger entries are clearly fake, filterable in traces/metrics, and purgeable
  on teardown.

---

## Section 4 — Infrastructure & deployment

### Terraform

```
modules/mesh/                 ONE reusable module, instantiated per service (9x)
  - k8s Deployment + Service + IRSA SA + optional HPA + PodMonitor + NetworkPolicy
  - params: name, image, lang, port, env, replicas, requests/limits
modules/loadgen/              loadgen Deployment + control Service + CronJob trickle
modules/observe-bff-access/   least-priv read paths to Tempo/Mimir/Loki internal
                              Services from the storefront namespace + NetworkPolicy
EventBridge bus + rules       enrichment/analytics lambda wiring (reuse event plumbing)
SQS DLQ (optional)            lambda failure capture
```

Wired through `stacks/platform`. Dev: 1 replica, tiny limits, HPA off;
staging/prod knobs left as variables (no behavior change for existing envs).

### Deployment

- All images via ECR pull-through cache (`ecr-public` prefix).
- Each service renders k8s manifests like order-api; env-var contract-check
  extended to every new Node service.

### CI/CD

```
.github/workflows/mesh.yml    build/test/scan/push each polyglot service
    matrix: {gateway,payment:node, pricing,ledger:go, inventory,projection:python, fraud:java}
    per-lang: lint + test + coverage gate + Docker build + Trivy scan + push
app.yml                       extend deploy ordering: gateway+mesh after order-api,
                              before loadgen
.github/workflows/loadgen.yml workflow_dispatch on-demand load run
drift-detection.yml           add new stacks/platform resources to drift scan
```

### Pipeline order (extends the project guide staged applies)

```
bootstrap+networking+dns → EKS → ingress → observability → security → database
  → mesh → loadgen → self_healing/slo/finops → final sync
```

---

## Section 5 — Cleanup & removals

Deletion rule: a file/module is removed **only after `rg` confirms zero
remaining references** (per #62 discipline). Ambiguous items are kept and
flagged, not speculatively deleted. Do-not-break tripwires untouched.

### Remove

- Shop frontend: `app/products/**`, `app/cart/**`, `app/checkout/**`,
  `app/orders/**`, `app/admin/**` and their shop-only components.
- Admin upload UI + `app/api/admin/upload/route.ts`.
- `modules/storefront-assets` (S3 + CloudFront + image-resize Lambda) — uploads
  have no place in a console.
- Shop-only API routes / lib helpers once `rg` shows zero references.

### Keep & reframe (real distributed plumbing → synthetic scenarios)

- order-api (the order/event engine the mesh drives).
- `storefront-cart`, `storefront-checkout` (Step Functions saga),
  `storefront-search`, `storefront-events` (Kinesis), `storefront-realtime`
  (WebSocket) — these make the map bigger; reframed as scenarios, not deleted.
- All landing/site components, `/design`, `/privacy`, GDPR routes, auth/login.

### Docs to update

- the project guide — current state, contract (new services), pipeline order,
  do-not-break additions, backlog rows.
- `README`, `docs/runbooks/*`, new ADRs (mesh module, loadgen, console BFF,
  polyglot tracing).
- `apps/order-api/openapi.yaml` + new per-service contracts.

---

## Section 6 — Final review/audit pass (build first, review last)

After mesh + console + loadgen are built and green, one comprehensive pass over
the full branch diff before merge:

1. **Code review** — `/code-review` high effort over the diff + per-language
   review of new services (idioms, error handling, context propagation, leaks).
2. **Security review** — `/security-review`: authn/authz on every new endpoint,
   HMAC on internal hops, BFF never leaks observability creds, loadgen
   un-weaponizable (SSRF/runaway), synthetic-tenant isolation, NetworkPolicies.
3. **Vuln scan** — npm audit (node), govulncheck (go), pip-audit (python),
   Trivy/OWASP dep-check (java + all images), trivy fs + image.
4. **Automation audit** — actionlint, OIDC least-priv, no hardcoded ARNs, matrix
   CI correctness, per-language coverage gates, drift covers new resources,
   contract-check extended.
5. **Best practices** — consistent OTel across langs, structured logging +
   redaction, healthz/readyz everywhere, graceful shutdown, resource limits,
   PodSecurity, image pinning via ECR cache.

Findings → backlog rows in the project guide with the existing ID/severity discipline.
P1/P2 fixed before merge; P3/P4 triaged. Final verification (tests + builds
green) before any PR.

---

## Build order (phases)

1. **mesh-foundation** — `modules/mesh`, api-gateway (Node) + one downstream
   (pricing, Go) end-to-end with OTel + ECR + manifests + CI matrix skeleton.
   Proves the template + one polyglot hop + one trace.
2. **mesh-fill** — inventory (Python), fraud (Java), payment (Node),
   ledger (Go), projection-worker (Python). Full sync chain + Kinesis consumer.
3. **serverless** — enrichment-lambda + analytics-lambda + EventBridge bus +
   wiring into existing Kinesis/saga.
4. **loadgen** — loadgen service + scenarios + safety rails + CronJob trickle +
   loadgen.yml.
5. **console** — BFF `/api/observe/*` + `/api/load/*`, `/console` `/traces`
   `/services` `/load` pages (frontend-design), navbar restructure.
6. **cleanup** — remove shop UI + admin upload + storefront-assets; rg-verify;
   update all docs/ADRs/the project guide.
7. **review** — Section 6 comprehensive pass; fix P1/P2; verify; ready to merge.

Each phase ends green (tests + builds) before the next begins.
