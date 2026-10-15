# CloudOps — Feature Inventory

This document is a feature-by-feature reference for anyone who needs to understand what this project does and is capable of, without
reading the whole repo. It is descriptive, not promotional. Sections proceed
top-down: storefront UX → API surface → data model → realtime / async →
identity & auth → security controls → observability → infrastructure → CI/CD →
operational tooling.

Pair this file with `BACKLOG.md` (open work), `docs/adr/` (decisions) and
`apps/order-api/openapi.yaml` (formal API contract) for full coverage.

---

## 1. Storefront (Next.js 15 App Router)

Source: `apps/storefront/`.

### 1.1 Public marketing/architecture pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page. Animated hero with log-stream effect, feature grid, architecture preview, CTA. |
| `/platform` | Platform overview — modules, capabilities, "what's running" tiles. |
| `/architecture` | Full architecture diagram + per-domain panels (Cognito, OTel, realtime, search, saga, defense-in-depth). |
| `/pipeline` | CI/CD pipeline visualization (foundation → cluster → platform stack apply). |
| `/design` | Design-system showcase page (typography, color, component samples). |
| `/cookies`, `/privacy` | Static legal pages. |

All marketing pages share `components/site/*` primitives: `Hero`, `SubHero`,
`Bento`, `FeatureGrid`, `TechStack`, `Pipeline`, `Footer`, `Navbar`,
`ScrollProgress`, `Sparkline`, `SloGauge`, `ServiceTile`, `CallToAction`,
plus animation hooks `useCountUp`, `useInView`, `useMouseParallax`.

### 1.2 Commerce pages

| Route | Behaviour |
|-------|-----------|
| `/products` | Paginated product grid. Server-rendered with `ProductGrid` + `Pagination` + `SearchBar`. Tenant-scoped via JWT or header. |
| `/products/[id]` | Product detail with `AddToCartButton`. Has `loading.tsx` + `error.tsx`. |
| `/cart` | Cart view (`CartView`). DynamoDB-backed for guests, JWT subject for logged-in users. |
| `/checkout` | Checkout entrypoint. `CheckoutButton` kicks off Step Functions saga via `POST /api/checkout`. |
| `/checkout/success` | Post-checkout confirmation page. |
| `/orders` | Authenticated order list — JWT subject scope, served by order-api `GET /orders`. |
| `/orders/[id]` | Single-order detail with real-time status (`OrderStatusPill`). |
| `/admin` | Admin shell with its own `layout.tsx`. |
| `/admin/upload` | Product image upload UI (`ImageUploader` calling presigned-PUT API). |
| `/login` + `/login/start` | Hosted-UI redirect entrypoint (Cognito) + safe `next` cookie. |
| `/auth/callback` | OIDC code exchange, session cookie issuance. |

### 1.3 Storefront API routes (Next.js Route Handlers)

`apps/storefront/src/app/api/`:

- `POST /api/cart` — add product to cart. Accepts `{productId, qty}` only;
  server fetches authoritative `sku/name/price_cents` from order-api before
  writing to DynamoDB. Guest cart uses UUID cart key with collision-check
  retry (writes `GUEST#META` sentinel with `attribute_not_exists`, up to 5
  attempts).
- `POST /api/checkout` — acquires a 60s DynamoDB checkout lock, then calls
  Step Functions `StartExecution`. Returns 409 `checkout_in_progress` if
  another checkout is already running for the cart.
- `POST /api/admin/upload` — issues 300s-expiry presigned PUT URLs to S3
  (admin-only, JWT-gated). Max payload ~10MB.
- `GET /api/ws-token` — mints short-lived WebSocket auth token for realtime
  order-status updates via API Gateway WS.
- `GET /api/health`, `GET /api/ready` — liveness + readiness for the
  storefront pod.
- `GET /api/privacy/*` — privacy export/erase proxied to order-api.

### 1.4 Storefront libraries (`src/lib/`)

- `auth.ts` — session cookie verification, OIDC code exchange, JWT decode.
- `cart.ts` — DynamoDB cart CRUD; guest cart key issuance with collision
  retry; checkout lock acquire/release.
- `api.ts` — server-to-server fetch wrapper to order-api with HMAC.
- `ws.ts` — WebSocket client with full-jitter exponential backoff.
- `realtime.ts` — order status subscription helper.
- `rate-limit.ts` — per-route limiter.

### 1.5 Storefront security posture

- Helmet-equivalent headers configured in `next.config.ts:headers()`:
  - CSP enforcing `default-src 'self'`, `frame-ancestors 'none'`,
    `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`,
    `upgrade-insecure-requests`, `connect-src 'self' https: wss:`.
    `'unsafe-inline'` retained on script/style pending nonce migration.
  - HSTS 1y + includeSubDomains.
  - X-Frame-Options DENY, X-Content-Type-Options nosniff,
    Referrer-Policy no-referrer, COOP + CORP same-origin.
  - Permissions-Policy disables camera, microphone, geolocation, payment.
- Open-redirect hardening: `cloudops_post_login` cookie validated with
  `isSafeNextPath()` at both write time and read time; rejects `//x`,
  `/\\x`, absolute URLs, non-strings. Read-side asserts origin match.
- OAuth callback errors collapse to literal `token_exchange_failed`; full
  error logged server-side. No arbitrary message in `?error=`.
- `.env`, `.env.*` ignored with allowlist for `.env.example` /
  `.env.*.example`.

---

## 2. Order API (Node.js + Express + TypeScript)

Source: `apps/order-api/`. Formal contract in `openapi.yaml`.

### 2.1 Public endpoints

| Method + Path | Auth | Purpose |
|---------------|------|---------|
| `GET /` | none | Service banner. |
| `GET /health` | none | Liveness. |
| `GET /ready` | none | Readiness (DB ping). |
| `POST /order` | JWT or API key | Create order. Idempotency + repricing + audit. |
| `GET /orders` | JWT or API key | List orders (JWT = own only, API key = tenant-wide). |
| `GET /orders/:orderId` | JWT or API key | Get one order (ownership-scoped). |
| `GET /privacy/export` | JWT (user subject required) | Export caller's data. |
| `POST /privacy/erase` | JWT (user subject required) | Anonymize caller's links + drop subject idempotency keys. |
| `GET /products` | JWT or API key | Tenant-scoped catalog list. |
| `GET /products/:id` | JWT or API key | Single product. |

### 2.2 Internal endpoints (HMAC-gated, `requireInternalHmac`)

| Method + Path | Purpose |
|---------------|---------|
| `POST /_internal/search` | Postgres FTS query, consumed by search-gateway Lambda. |
| `POST /_internal/admin/products` | Create product. |
| `PUT /_internal/admin/products/:id` | Update product. |
| `DELETE /_internal/admin/products/:id` | Soft-delete product. |

HMAC uses `X-Internal-Signature` over the canonical request. Supports
**dual-accept rotation**: both `INTERNAL_HMAC_SECRET` and
`INTERNAL_HMAC_SECRET_PREVIOUS` validated in constant time, enabling
zero-downtime rotation.

### 2.3 Order create pipeline (`POST /order`)

1. Auth chain resolves JWT or API key → tenant + (optional) user subject.
2. Origin/CSRF check on browser requests (allow-listed origins via
   `ALLOWED_ORIGINS`).
3. Helmet-equivalent middleware (CSP off — JSON API; HSTS, X-Content-Type-
   Options, X-Frame-Options DENY, Referrer-Policy no-referrer, CORP
   same-origin, X-Powered-By removed).
4. Body cap: 64 KiB. Returns 413 `payload_too_large` above that.
5. Validation: `items[]` size 1–50, qty 1–999, SKU regex
   `^[A-Za-z0-9._-]{1,64}$`, total ≤ 1,000,000, ≤ 2 decimals.
6. Idempotency: `Idempotency-Key` scoped by `(tenant, subject)` for JWT
   callers and `(tenant)` for API-key callers. Same key + same payload
   replays original status/body. Same key + different payload = 409
   `idempotency_conflict`.
7. Tx: `withTenant(tenantId, userSub)` sets Postgres `app.tenant_id` +
   `app.user_sub`; RLS enforces tenant + ownership.
8. Repricing: server-side `PRODUCT_PRICE_LOOKUP_SQL` recomputes total from
   active products; mismatch → 422 `invalid_total`, unknown SKU →
   422 `unknown_sku`.
9. Audit event written to `audit_events`.
10. Optional Kinesis stream emit (`kinesis.ts`) for downstream consumers
    (event-driven cart/order projection).

### 2.4 JWT verification (`auth-jwt.ts`)

- jose-based JWKS verify with caching.
- Required claims: `iss` (matches `OIDC_ISSUER`), `aud` (matches
  `OIDC_AUDIENCE`), `exp`/`nbf`, `scope` includes all
  `OIDC_REQUIRED_SCOPES`.
- Tenant precedence: `custom:tenant_id` → flat `tenant_id` → `X-Tenant-Id`
  (API-key path only) → `default` (dev/test only).
- Emits `jwt_verify_total{outcome=ok|expired|wrong_issuer|wrong_audience|
  invalid_signature|missing_scope|jwks_unreachable|other}` Prometheus
  counter via `onOutcome` callback. Drives `OIDCJWKSUnreachable` alert.

### 2.5 Migrations (`apps/order-api/migrations/`)

Forward-only, advisory-lock-guarded, per-file transactions.

| File | Contents |
|------|----------|
| `001_initial.sql` | `orders` table (id, order_id, items JSONB, total, environment, created_at). |
| `002_multitenancy.sql` | Adds `tenant_id` + indexes. |
| `003_rls.sql` | Row-Level Security enabled + FORCED on `orders`; policy `tenant_isolation` using `current_setting('app.tenant_id')`. |
| `004_idempotency_keys.sql` | `order_idempotency_keys` table for `Idempotency-Key` storage. |
| `005_audit_events.sql` | Append-only audit log table. |
| `006_products.sql` | `products` table with `tsvector` GENERATED column + GIN index for FTS; FORCED RLS. |
| `007_order_ownership.sql` | Adds `owner_sub` to orders; tightens RLS policy so JWT subject only sees own rows; adds `subject_scope` to idempotency keys to prevent cross-user replay within a tenant. |

Migration runner (`migrations.ts`): acquires `pg_advisory_lock`, applies
sequentially in own transactions, writes `schema_migrations` row each
time. Migration Job has `activeDeadlineSeconds: 600` in
`k8s/migration-job.yaml`.

### 2.6 Operational endpoints (non-public)

- `GET /metrics` (port 9090, separate listener) — Prometheus scrape.
  Custom counters: `jwt_verify_total`, idempotency hits, repricing
  rejections, audit writes.
- Logger (`logger.ts`): pino factory with redact policy covering
  `password`, `token`, `secret`, `authorization`, `cookie`, plus Express
  headers `authorization`, `cookie`, `x-internal-signature`, `x-api-key`.

---

## 3. Data model summary

### 3.1 Postgres (RDS)

- `orders` — RLS by `tenant_id` AND (`owner_sub IS NULL or user_sub`
  matches).
- `order_idempotency_keys` — PK `(tenant_id, subject_scope,
  idempotency_key)`; RLS by tenant + subject.
- `products` — RLS by tenant; GIN index on `search_tsv` (English FTS over
  name + description + sku).
- `audit_events` — append-only, RLS by tenant.
- `schema_migrations` — migration ledger.

All tenant tables: `ENABLE ROW LEVEL SECURITY` **plus** `FORCE ROW LEVEL
SECURITY` — table owner cannot bypass.

### 3.2 DynamoDB

- `cloudops_carts` (single table):
  - Guest cart: `pk = "GUEST#<uuid>"`, `sk = "ITEM#<sku>"` or `"META"` /
    `"CHECKOUT#LOCK"`.
  - Logged-in cart: `pk = "USER#<sub>"`, same `sk` shape.
  - Items store `{sku, qty, name, price_cents}` resolved server-side at
    insert time.

### 3.3 S3

- `cloudops-storefront-uploads-<env>` — admin product image uploads
  (presigned PUT, 300s).
- Image-resize Lambda fans out variants (small/medium/large WebP) on
  `s3:ObjectCreated:*`.

### 3.4 SSM Parameter Store

- `/cloudops/<env>/otel/endpoint` + `/metrics` `/traces` `/logs` (String).
- `/cloudops/<env>/otel/api-key` (SecureString).
- Rotated by `random_password.otel_api_key.keepers` window.

### 3.5 Secrets Manager

- `order-api-internal/hmac-secret`, `hmac-secret-previous` (rotation).
- `order-api/api-key` (Secrets Manager ARN per env).
- RDS master, OTel bearer mirror.

---

## 4. Realtime + async architecture

### 4.1 Checkout saga

`modules/storefront-checkout/`:
- API Gateway → Lambda `start_checkout` → Step Functions state machine.
- States: validate cart → reprice → reserve stock → charge (mock) →
  persist order via `POST /_internal/admin/...` (HMAC) → emit
  order-confirmation email → publish to EventBridge.
- Email Lambda (`lambdas/email/index.mjs`) escapes all interpolated
  fields with `escapeHtml()`.

### 4.2 Realtime order status

`modules/storefront-realtime/`:
- API Gateway WebSocket + Lambda `connect` / `disconnect` / `default`.
- Connections stored in DynamoDB by `(user_sub|guest_id, connection_id)`.
- Order-events EventBridge bus → Lambda fan-out → posts to WS clients.
- Storefront client (`lib/ws.ts`) reconnects with full jitter
  (`jittered(backoffMs) = Math.floor(Math.random() * backoffMs)`).

### 4.3 Events

`modules/storefront-events/`:
- EventBridge custom bus `cloudops-orders-<env>`.
- Schemas registered in Schema Registry.
- Subscribers: realtime fan-out, email Lambda, future analytics.

### 4.4 Search

`modules/storefront-search/`:
- search-gateway Lambda → calls `POST /_internal/search` (HMAC).
- order-api translates query to `plainto_tsquery('english', $1)` against
  the `products.search_tsv` GIN index.

---

## 5. Identity & authentication

### 5.1 Cognito (`modules/auth/`)

- User Pool with Hosted UI.
- Token revocation enabled.
- `prevent_user_existence_errors = ENABLED`.
- `user_pool_add_ons.advanced_security_mode = ENFORCED` in prod, `AUDIT`
  in lower envs — provides bot + credential-stuffing protection.
- Custom claim `custom:tenant_id` on every user.
- OIDC issuer + JWKS consumed by order-api.

### 5.2 Storefront session

- Hosted UI → callback → server exchanges code → encrypted session
  cookie (HttpOnly, Secure, SameSite=Lax).
- `next` cookie scrubbed through `isSafeNextPath()` before redirect.
- WebSocket auth: short-lived signed token from `/api/ws-token`.

### 5.3 Order-API API key path

- Loaded from `API_KEY_SECRET_ARN` at boot (`server.ts:resolveApiKey`).
- Supports rotated JSON and rotated plaintext shapes; logs warn on
  parse-failure fallback.
- Used for service-to-service callers (search-gateway, checkout saga,
  email Lambda). Tenant header required outside dev/test/local.

---

## 6. Security controls (cross-cutting)

### 6.1 Network

- WAF in front of ALB (`modules/ingress/waf.tf`). Rules: AWS managed
  CommonRuleSet, KnownBadInputs, IPReputation; rate-limit rule.
- WAF logging retention: 30d dev / 90d staging / 365d prod
  (`var.waf_log_retention_days`).
- AWS Shield Standard only (Shield Advanced deferred — see ADR 022;
  compensating controls documented).
- Private EKS endpoints; NAT-less nodes; emergency CIDR workflow as
  break-glass.

### 6.2 Application

- CSRF: order-api Origin allow-list middleware on POST/PUT/PATCH/DELETE.
- CSP: storefront enforcing, order-api skipped (JSON).
- Helmet: both apps, X-Powered-By removed, COOP/CORP same-origin.
- Body size cap (64 KiB) on order-api JSON.
- Per-tenant rate limit at app layer.
- SKU regex enforced at both validation and admin-write paths.
- Server-side repricing prevents client price tampering.

### 6.3 Supply chain

- Cosign Gatekeeper provider deployed when
  `var.enable_cosign_provider = true`
  (`modules/security/gatekeeper.tf`). Precondition guard prevents
  enabling the constraint without the provider.
- ECR pull-through cache (`ecr-public/` prefix) — every `public.ecr.aws`
  image resolves through the cache because nodes have no NAT.

### 6.4 Secrets

- HMAC rotation via dual-accept.
- OTel bearer token windowed rotation
  (`var.otel_token_rotation_days = 90` in staging example).
- KMS per signal (Loki/Tempo/Mimir) — see ADR 023 on blast-radius
  separation.
- EKS secrets encryption with dedicated CMK
  (`modules/eks/secrets_kms.tf`) when
  `var.enable_secrets_encryption = true` (default null → auto-enable for
  staging/prod).

### 6.5 Compliance + privacy

- GDPR-style endpoints: `GET /privacy/export`, `POST /privacy/erase`.
- Audit log append-only.
- Forward-only migrations with documented rollback policy
  (`docs/runbooks/migration-rollback.md`).
- OWASP Top-10 status map at
  `docs/security/owasp-top-10-status.md` — one row per category, "Open
  gaps" is source of truth.
- Abuse-response runbook at
  `docs/runbooks/security/abuse-response.md` covering illegal upload,
  signup spam, API abuse, credential stuffing.

---

## 7. Observability

`modules/observability/`:

- OpenTelemetry Collector (gateway pattern) on the cluster.
  - OTLP/gRPC 4317, OTLP/HTTP 4318.
  - `bearertokenauth` for both.
  - Public ingress at `https://otel.<domain>`.
- Loki (logs), Tempo (traces), Mimir (metrics). Per-signal KMS CMKs.
- Grafana with sidecar-driven config:
  - `grafana_dashboard=1` — dashboards.
  - `grafana_alert=1` — alert rules + contact points + policies.
  - `grafana_datasource=1` — extra datasources.
- Alertmanager.
  - Self-monitoring `PrometheusRule` ships three alerts:
    `AlertmanagerDown`, `AlertmanagerConfigSyncFailing`,
    `AlertmanagerNotificationsFailing`.
  - `scripts/verify-alerting.sh` asserts the rule and alert names.
- JWKS health alert `OIDCJWKSUnreachable` fires when
  `jwt_verify_total{outcome="jwks_unreachable"}` rate > 0.1/s for 2m.

OTel endpoints published to SSM for external producers (see
[`Data model summary`](#34-ssm-parameter-store)).

---

## 8. Reliability + self-healing

- `modules/self_healing/` — Argo Rollouts / canary infra, HPA defaults,
  PDBs.
- `modules/slo/` — SLO definitions (Sloth-style PrometheusRules).
- Order-API Deployment uses
  `${ORDER_API_REPLICAS}` placeholder rendered at deploy time
  (default 2, overridable per env).
- Migration Job `activeDeadlineSeconds: 600` (no hung migrations).
- Backups: `modules/backup/` — AWS Backup plans for RDS + DynamoDB.

---

## 9. FinOps

`modules/finops/`:

- AWS Budgets with 80% / 100% SNS notifications.
- Tag-based cost allocation enforced via `module.compliance`.
- No hard-cap action yet (backlog #139) — runaway script could exceed
  100% until a human reads the email.

---

## 10. Infrastructure layout

### 10.1 Layered stacks (in progress, backlog #16)

- `stacks/foundation/` — bootstrap (OIDC, IAM, ECR cache, state bucket),
  DNS, networking, compliance, database, backup.
- `stacks/cluster/` — EKS, secrets KMS, exposed outputs.
- `stacks/platform/` — Helm + Kubernetes addons: ingress, observability,
  security, self_healing, slo, finops, storefront-*, auth.
- Apply order driven by `scripts/terraform-stacks.sh`.
- CI normal path: foundation → cluster → platform.
- Legacy root `-target` apply gated by `LEGACY_ROOT_APPLY=1` (break-glass
  during migration).

### 10.2 What stays up overnight

- `module.bootstrap`: OIDC provider, GitHub Actions IAM role, ECR
  pull-through, S3 state bucket.
- `module.dns`: Route 53 hosted zone.

Everything else is destroyed nightly and rebuilt by pipeline.

### 10.3 Bootstrap (`modules/bootstrap/`)

- GitHub Actions OIDC provider + IAM role with trust policy covering
  `repo:<owner>/<repo>:environment:dev|staging|production` and
  `refs/heads/main`.
- ECR pull-through cache (prefix `ecr-public`).
- S3 state bucket + KMS.

### 10.4 Database (`modules/database/`)

- RDS Postgres (Aurora-ready scaffolding).
- Secrets Manager-driven master password.
- SAR rotation Lambda with documented bump procedure inline.
- Master snapshot policy.

### 10.5 EKS (`modules/eks/`)

- Private endpoints by default.
- Managed node groups, no NAT.
- IRSA wired for ingress controller, ExternalDNS, cert-manager,
  observability components, storefront, order-api.
- Secrets encryption with dedicated CMK (staging/prod by default).

### 10.6 Ingress (`modules/ingress/`)

- ALB Ingress Controller.
- WAF Web ACL with rate-limit + managed rule groups.
- ACM cert via DNS-01 (cert-manager-managed) for `*.<domain>`.
- Configurable WAF log retention.

### 10.7 Compliance + tagging (`modules/compliance/`)

- AWS Config rules.
- Required-tag enforcement.

### 10.8 CodeArtifact (`modules/codeartifact/`)

- Private package repo for internal libraries.

### 10.9 Compute (`modules/compute/`)

- Reserved/spot mix decisions, Karpenter scaffolding if enabled.

---

## 11. Apps + libraries

- `apps/order-api` — Express/TS service described above.
- `apps/storefront` — Next.js 15 App Router.
- `libraries/` — multi-language logging SDKs:
  - `node/logs`, `python/logs`, `go/logs`, `java/logs`, `dotnet/logs`,
    `cpp/logs`.
  - All wrap OTel resource detection, sampling, log rendering, exporter
    setup with fallback.
  - Coverage gates enforced in `libraries.yml` workflow.
  - Aggregate coverage report posted to each workflow run.

---

## 12. CI/CD

### 12.1 Workflows (`.github/workflows/`)

| Workflow | Purpose |
|----------|---------|
| `infra.yml` | Terraform fmt/validate/tflint/plan/apply per stack. |
| `app.yml` | order-api: test + build + deploy via kubeconform + kubectl. |
| `storefront.yml` | storefront: build + (build-and-push + deploy are skeletons, activation gated on prerequisites). |
| `libraries.yml` | Multi-language test + coverage for the 6 SDK ports + aggregate report. |
| `drift-detection.yml` | Scheduled `terraform plan -detailed-exitcode` per stack; `workflow_dispatch` accepts a `stacks` subset input. |
| `eks-emergency-access.yml` | Break-glass — widens cluster CIDR briefly. |

### 12.2 Gating

- `vars.AUTO_RUN_ON_MERGE == 'true'` gates push-event auto-deploy.
  Default unset = PR/dispatch only.
- Drift detection surfaces as `::warning::` + `drift=true` step output;
  build stays green so reviewers decide.

### 12.3 Deployment

- order-api: rendered from `apps/order-api/k8s/*.yaml` with placeholder
  substitution (`render-k8s.ts`); `kubeconform` validation; `kubectl
  apply`; migration Job runs first.
- IRSA ARNs come from `terraform output` at deploy time; manifest
  placeholders are intentionally fake (`PLACEHOLDER-not-real`).

---

## 13. Tooling + scripts (`scripts/`)

- `deploy.sh`, `destroy.sh`, `oidc.sh` — env-level deploy lifecycle.
- `tf-init.sh` — wraps `terraform init` with partial S3 backend config
  from `terraform.tfvars`.
- `terraform-stacks.sh` — driver for layered stack plan/apply with
  `-detailed-exitcode` support.
- `validate-k8s-manifests.sh` — render + `kubeconform`; auto-installs
  tools to `.tools/`.
- `verify-alerting.sh` — asserts Alertmanager self-monitoring rules
  loaded.
- `apps/order-api/scripts/contract-check.ts` — env-var drift check
  between `src/` and `k8s/deployment.yaml`.

---

## 14. ADRs of note (`docs/adr/`)

- 003 — OTel collector gateway shape.
- 013 — emergency CIDR break-glass.
- 021 — tenant claim precedence (`custom:tenant_id` wins).
- 022 — Shield Advanced deferral with triggers.
- 023 — Observability KMS signal separation.
- 024 — HMAC 5-minute replay window accepted.
- 025 — Self-hosted runner: ARC-on-EKS chosen, EC2/managed rejected.

---

## 15. Known open gaps (`BACKLOG.md` is the source of truth)

- #16 — Layered stack migration: runbook needs validation on a live env.
- #9 — Service mesh (Cilium / mTLS east-west) missing.
- #76 (impl) — ARC-on-EKS module + runner image + workflow migration not
  yet built.
- #138 — JSON response shape audit for PII / internal tokens.
- #139 — AWS Budgets hard-cap action (currently notify-only).
- #140 — CSAM/NCMEC hash scan on storefront upload pipeline.

---

## How to use this file

If you are starting cold on this repo:

1. Read this file (high-level feature surface).
2. Read `BACKLOG.md` (open work) and `docs/adr/` (decisions).
3. Read `apps/order-api/openapi.yaml` for the formal API contract.
4. Pull module-level READMEs as needed by topic.
