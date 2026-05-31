# Distributed Polyglot Mesh + Console + Traffic Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the e-commerce shop UI with a large-scale distributed system: 9 net-new polyglot services (Go/Python/Java/Node) + 2 Lambdas fanning out one synthetic request across 8–10 services, an operator console reading real Tempo/Mimir/Loki data, and a traffic generator (live UI + scheduled trickle).

**Architecture:** Each new service is a thin, single-purpose, OTel-instrumented unit following the order-api template (for Node) or the matching `libraries/<lang>/logs` port. A generic `modules/mesh` Terraform module is instantiated per service. The storefront's shop pages are removed; new console pages read observability backends through a Cognito-gated BFF. Backend plumbing (cart/checkout/search/events/realtime) is kept and reframed as synthetic load scenarios.

**Tech Stack:** Node 22 + Express + TS + node:test; Go 1.22 + net/http + testing; Python 3.12 + FastAPI + pytest; Java 17 + Spring Boot + JUnit; OpenTelemetry (all langs); Terraform; Next.js 15 (App Router, RSC); Tempo/Mimir/Loki HTTP APIs.

**Spec:** `docs/superpowers/specs/2026-05-31-distributed-mesh-console-design.md`

---

## Conventions every new service follows

- **Layout:** `apps/<name>/` self-contained: source, `Dockerfile` (multi-stage, non-root UID 1001), `k8s/deployment.yaml` + `service.yaml`, tests.
- **Endpoints:** `/healthz` (liveness), `/readyz` (readiness), `/metrics` (Prometheus), plus the service's one functional route.
- **Tracing:** import the OTel SDK first; propagate W3C `traceparent`; service name = `<name>`. Node mirrors `apps/order-api/src/tracing.ts` (skip SDK when `OTEL_EXPORTER_OTLP_ENDPOINT` empty).
- **Internal auth:** service-to-service POSTs are HMAC-gated using the same scheme as order-api `/_internal/*` (`X-Internal-Signature` = HMAC-SHA256 of the raw body, constant-time compare, dual-key rotation). Reads can be open within the mesh NetworkPolicy.
- **Images:** referenced via the ECR pull-through cache (`ecr-public` prefix) for any public base. Build/push to the project ECR.
- **k8s securityContext:** `runAsNonRoot`, `runAsUser: 1001`, `readOnlyRootFilesystem: true`, `capabilities: drop [ALL]`, `seccompProfile: RuntimeDefault` — copy order-api.
- **Synthetic tagging:** loadgen requests carry `x-synthetic: 1` and a `tenant_id=synthetic-*`. Services must propagate, never strip, these.

---

## PHASE 1 — mesh-foundation (full detail; executed this session)

Proves the template end-to-end: api-gateway (Node) → pricing (Go), both OTel-instrumented, both with healthz/readyz/metrics, a generic `modules/mesh` Terraform module, and a CI matrix skeleton. One synthetic request produces a 2-service trace.

### Task 1.1: pricing service (Go) — skeleton + price endpoint

**Files:**
- Create: `apps/pricing/go.mod`
- Create: `apps/pricing/main.go`
- Create: `apps/pricing/pricing.go`
- Test: `apps/pricing/pricing_test.go`

- [ ] **Step 1: Write the failing test** (`apps/pricing/pricing_test.go`)

```go
package main

import "testing"

func TestQuoteSumsLineItems(t *testing.T) {
	items := []LineItem{{SKU: "A", PriceCents: 100, Qty: 2}, {SKU: "B", PriceCents: 50, Qty: 1}}
	got := Quote(items)
	if got.TotalCents != 250 {
		t.Fatalf("TotalCents = %d, want 250", got.TotalCents)
	}
	if len(got.Lines) != 2 {
		t.Fatalf("Lines = %d, want 2", len(got.Lines))
	}
}

func TestQuoteRejectsNegativeQty(t *testing.T) {
	_, err := QuoteChecked([]LineItem{{SKU: "A", PriceCents: 100, Qty: -1}})
	if err == nil {
		t.Fatal("expected error for negative qty")
	}
}
```

- [ ] **Step 2: Init module + run test to verify it fails**

Run: `cd apps/pricing && go mod init github.com/cloudops/pricing && go test ./...`
Expected: FAIL — `undefined: Quote`, `undefined: LineItem`.

- [ ] **Step 3: Implement `pricing.go`**

```go
package main

import "errors"

type LineItem struct {
	SKU        string `json:"sku"`
	PriceCents int64  `json:"price_cents"`
	Qty        int64  `json:"qty"`
}

type QuoteResult struct {
	Lines      []LineItem `json:"lines"`
	TotalCents int64      `json:"total_cents"`
}

// Quote sums price_cents*qty across items. Assumes validated input.
func Quote(items []LineItem) QuoteResult {
	var total int64
	for _, it := range items {
		total += it.PriceCents * it.Qty
	}
	return QuoteResult{Lines: items, TotalCents: total}
}

// QuoteChecked validates then quotes.
func QuoteChecked(items []LineItem) (QuoteResult, error) {
	for _, it := range items {
		if it.Qty < 0 || it.PriceCents < 0 {
			return QuoteResult{}, errors.New("negative qty or price")
		}
	}
	return Quote(items), nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pricing && go test ./...`
Expected: PASS (`ok github.com/cloudops/pricing`).

- [ ] **Step 5: Commit**

```bash
git add apps/pricing
git commit -m "feat(pricing): Go price-quote core + tests"
```

### Task 1.2: pricing HTTP server (healthz/readyz/metrics + /quote)

**Files:**
- Create: `apps/pricing/main.go`
- Create: `apps/pricing/server_test.go`

- [ ] **Step 1: Write failing test** (`apps/pricing/server_test.go`)

```go
package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestHealthz(t *testing.T) {
	rr := httptest.NewRecorder()
	NewMux().ServeHTTP(rr, httptest.NewRequest("GET", "/healthz", nil))
	if rr.Code != http.StatusOK {
		t.Fatalf("healthz = %d, want 200", rr.Code)
	}
}

func TestQuoteEndpoint(t *testing.T) {
	body := `{"items":[{"sku":"A","price_cents":100,"qty":2}]}`
	rr := httptest.NewRecorder()
	req := httptest.NewRequest("POST", "/quote", strings.NewReader(body))
	NewMux().ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("quote = %d, want 200; body=%s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"total_cents":200`) {
		t.Fatalf("body = %s, want total_cents 200", rr.Body.String())
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/pricing && go test ./...`
Expected: FAIL — `undefined: NewMux`.

- [ ] **Step 3: Implement `main.go`** (mux + handlers + listen; OTel via env, no-op when endpoint empty)

```go
package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

type quoteRequest struct {
	Items []LineItem `json:"items"`
}

func NewMux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("/readyz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) })
	mux.HandleFunc("/quote", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req quoteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"bad_json"}`, http.StatusBadRequest)
			return
		}
		res, err := QuoteChecked(req.Items)
		if err != nil {
			http.Error(w, `{"error":"invalid_items"}`, http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(res)
	})
	return mux
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("pricing listening on :%s", port)
	if err := http.ListenAndServe(":"+port, NewMux()); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/pricing && go test ./...`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pricing
git commit -m "feat(pricing): HTTP server with healthz/readyz/quote"
```

> NOTE: OTel for Go is added in a later task (1.6) once the library import path is confirmed against `libraries/go/logs`. Keep this task dependency-free so it stays green.

### Task 1.3: pricing Dockerfile + k8s manifests

**Files:**
- Create: `apps/pricing/Dockerfile`
- Create: `apps/pricing/k8s/deployment.yaml`
- Create: `apps/pricing/k8s/service.yaml`

- [ ] **Step 1: Write `apps/pricing/Dockerfile`** (multi-stage, distroless/nonroot)

```dockerfile
# Build pricing (Go) — static binary, non-root distroless runtime.
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod ./
RUN go mod download || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /pricing .

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=builder /pricing /pricing
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/pricing"]
```

- [ ] **Step 2: Write `apps/pricing/k8s/deployment.yaml`** (copy order-api securityContext; placeholders rendered by render-k8s.ts)

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pricing
  namespace: "${MESH_NAMESPACE}"
spec:
  replicas: ${PRICING_REPLICAS}
  selector:
    matchLabels: { app: pricing }
  template:
    metadata:
      labels: { app: pricing }
    spec:
      serviceAccountName: "${PRICING_SERVICE_ACCOUNT}"
      securityContext:
        runAsNonRoot: true
        runAsUser: 65532
        runAsGroup: 65532
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: pricing
          image: "${PRICING_IMAGE}"
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: ["ALL"] }
          ports:
            - { name: http, containerPort: 8080 }
          resources:
            requests: { cpu: "25m", memory: "32Mi" }
            limits: { cpu: "100m", memory: "64Mi" }
          env:
            - { name: PORT, value: "8080" }
            - { name: OTEL_EXPORTER_OTLP_ENDPOINT, value: "${OTEL_ENDPOINT}" }
            - { name: OTEL_SERVICE_NAME, value: "pricing" }
            - name: OTEL_API_KEY
              valueFrom: { secretKeyRef: { name: otel-auth, key: api-key, optional: true } }
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            initialDelaySeconds: 5
          readinessProbe:
            httpGet: { path: /readyz, port: http }
            initialDelaySeconds: 3
```

- [ ] **Step 3: Write `apps/pricing/k8s/service.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: pricing
  namespace: "${MESH_NAMESPACE}"
spec:
  selector: { app: pricing }
  ports:
    - { name: http, port: 80, targetPort: http }
```

- [ ] **Step 4: Validate manifests render + kubeconform**

Run: `./scripts/validate-k8s-manifests.sh` (after extending it for the mesh dir in Task 1.7) — or for now `kubeconform` the rendered output manually.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/pricing/Dockerfile apps/pricing/k8s
git commit -m "feat(pricing): Dockerfile + k8s manifests"
```

### Task 1.4: api-gateway service (Node) — skeleton mirroring order-api split

**Files:**
- Create: `apps/api-gateway/package.json`
- Create: `apps/api-gateway/tsconfig.json`
- Create: `apps/api-gateway/src/tracing.ts` (copy of order-api tracing.ts)
- Create: `apps/api-gateway/src/app.ts`
- Create: `apps/api-gateway/src/server.ts`
- Test: `apps/api-gateway/test/app.test.ts`

- [ ] **Step 1: Write failing test** (`apps/api-gateway/test/app.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from './helpers/request.ts';
import { createApp } from '../src/app.ts';

test('GET /healthz returns 200', async () => {
  const app = createApp({ pricingUrl: 'http://unused', logger: console });
  const res = await request(app).get('/healthz');
  assert.equal(res.status, 200);
});

test('POST /v1/order fans out to pricing and returns a quote', async () => {
  // pricing stubbed via injected fetch
  const fakeFetch = async () => new Response(JSON.stringify({ total_cents: 200, lines: [] }), { status: 200 });
  const app = createApp({ pricingUrl: 'http://pricing', logger: console, fetchImpl: fakeFetch });
  const res = await request(app).post('/v1/order').send({ items: [{ sku: 'A', price_cents: 100, qty: 2 }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.total_cents, 200);
});
```

> NOTE: `test/helpers/request.ts` is a tiny supertest-style helper; if the repo already uses a pattern (check `apps/order-api/test`), reuse that instead. order-api uses raw `http` + `fetch` against `app.listen(0)` — mirror whichever it uses.

- [ ] **Step 2: Write `package.json`** (mirror order-api scripts; deps: express, OTel stack)

Copy `apps/order-api/package.json`, change `name` to `api-gateway`, drop pg/kinesis/jose deps not needed at gateway, keep express + OTel + helmet + prom-client. Keep the same `test`, `test:coverage`, `lint`, `contract-check`, `build` scripts.

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api-gateway && npm install && npm test`
Expected: FAIL — `Cannot find module '../src/app.ts'`.

- [ ] **Step 4: Implement `src/app.ts`** (express app factory: healthz/readyz/metrics + `/v1/order` fan-out to pricing via injectable `fetchImpl`)

```ts
import express, { type Express } from 'express';
import helmet from 'helmet';

export interface GatewayDeps {
  pricingUrl: string;
  logger: { info: (...a: unknown[]) => void; error: (...a: unknown[]) => void };
  fetchImpl?: typeof fetch;
}

export function createApp(deps: GatewayDeps): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  const doFetch = deps.fetchImpl ?? fetch;

  app.get('/healthz', (_req, res) => { res.status(200).json({ status: 'ok' }); });
  app.get('/readyz', (_req, res) => { res.status(200).json({ status: 'ready' }); });

  app.post('/v1/order', async (req, res) => {
    try {
      const pr = await doFetch(`${deps.pricingUrl}/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: req.body.items ?? [] }),
      });
      if (!pr.ok) { res.status(502).json({ error: 'pricing_failed' }); return; }
      const quote = await pr.json();
      res.status(200).json({ total_cents: quote.total_cents, lines: quote.lines });
    } catch (err) {
      deps.logger.error({ err }, 'gateway fan-out failed');
      res.status(502).json({ error: 'upstream_unavailable' });
    }
  });

  return app;
}
```

- [ ] **Step 5: Implement `src/server.ts`** (import './tracing' first, then listen; mirror order-api server.ts shape but no DB)

```ts
import './tracing';
import { createApp } from './app';

const PORT = Number(process.env.PORT) || 8080;
const PRICING_URL = process.env.PRICING_URL || 'http://pricing';
const app = createApp({ pricingUrl: PRICING_URL, logger: console });
const server = app.listen(PORT, '0.0.0.0', () => console.log(`api-gateway on :${PORT}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
```

- [ ] **Step 6: Copy `src/tracing.ts`** verbatim from `apps/order-api/src/tracing.ts`, change `OTEL_SERVICE_NAME` default if hardcoded (it reads env — no change needed).

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/api-gateway && npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api-gateway
git commit -m "feat(api-gateway): Node gateway with /v1/order fan-out to pricing"
```

### Task 1.5: api-gateway Dockerfile + k8s + contract-check

- [ ] **Step 1:** Copy `apps/order-api/Dockerfile` → `apps/api-gateway/Dockerfile`; drop the `migrations` COPY; change `EXPOSE 3000` → `8080`; update HEALTHCHECK path to `/healthz`.
- [ ] **Step 2:** Create `apps/api-gateway/k8s/deployment.yaml` + `service.yaml` mirroring pricing's but Node port 8080, image `${API_GATEWAY_IMAGE}`, env `PRICING_URL=http://pricing`, the standard OTel env block, and order-api's full securityContext.
- [ ] **Step 3:** Copy `apps/order-api/scripts/contract-check.ts` → `apps/api-gateway/scripts/contract-check.ts`; it asserts every `process.env.X` in `src/` has a matching key in `k8s/deployment.yaml`.
- [ ] **Step 4:** Run `cd apps/api-gateway && npm run contract-check` → Expected: PASS (no drift).
- [ ] **Step 5:** Commit `feat(api-gateway): Dockerfile + k8s + contract-check`.

### Task 1.6: OTel for Go (pricing) using libraries/go

- [ ] **Step 1:** Inspect `libraries/go/logs` exported API (`go doc ./...`). If it exposes a logger/tracer init, wire it in `main.go` behind `OTEL_EXPORTER_OTLP_ENDPOINT` (no-op when empty). Otherwise add `go.opentelemetry.io/otel` + otlptracehttp directly with an `initTracer()` that returns a no-op when the endpoint is empty.
- [ ] **Step 2:** Add a test asserting `initTracer("")` returns without error and a no-op shutdown func.
- [ ] **Step 3:** Wrap the mux with `otelhttp.NewHandler(NewMux(), "pricing")` so incoming spans are created and `traceparent` is honored.
- [ ] **Step 4:** `go test ./...` → PASS; `go build .` → success.
- [ ] **Step 5:** Commit `feat(pricing): OTel http instrumentation (no-op when endpoint empty)`.

### Task 1.7: generic `modules/mesh` Terraform module

**Files:**
- Create: `modules/mesh/variables.tf`, `main.tf`, `outputs.tf`, `README.md`

- [ ] **Step 1:** `variables.tf` — `name`, `image`, `namespace`, `port` (default 8080), `replicas` (default 1), `cpu_request`/`mem_request`/`cpu_limit`/`mem_limit`, `env` (map), `irsa_role_arn` (optional), `otel_endpoint`, `enable_hpa` (default false), `hpa_max` (default 3), `tags`.
- [ ] **Step 2:** `main.tf` — `kubernetes_deployment_v1` + `kubernetes_service_v1` + `kubernetes_service_account_v1` (IRSA annotation when role arn set) + optional `kubernetes_horizontal_pod_autoscaler_v2` + a `kubernetes_manifest` PodMonitor (or label for the existing Prometheus scrape) + a `kubernetes_network_policy_v1` allowing ingress only from the gateway/loadgen + egress to OTel. Set the full securityContext (runAsNonRoot, readOnlyRootFilesystem, drop ALL, seccomp RuntimeDefault).
- [ ] **Step 3:** `outputs.tf` — `service_dns` (`<name>.<namespace>.svc.cluster.local`), `service_account_name`.
- [ ] **Step 4:** `terraform fmt` + `terraform validate` (in a throwaway init or via `stacks/platform` wiring in Task 1.8).
- [ ] **Step 5:** Commit `feat(mesh): generic per-service Terraform module`.

### Task 1.8: wire pricing + api-gateway into stacks/platform behind `enable_mesh`

- [ ] **Step 1:** Add `enable_mesh` (bool, default false), `mesh_namespace` (default `cloudops`), and per-service image vars to `stacks/platform/variables.tf` + root `variables.tf`.
- [ ] **Step 2:** Add two `module "mesh_pricing"` / `module "mesh_gateway"` blocks with `count = var.enable_mesh ? 1 : 0`, passing image + otel_endpoint (reuse the observability endpoint var pattern at `stacks/platform/main.tf:430`). Gateway env includes `PRICING_URL = module.mesh_pricing[0].service_dns`.
- [ ] **Step 3:** Add a precondition: `enable_mesh` requires `enable_eks` and `enable_observability`.
- [ ] **Step 4:** `terraform fmt -check -recursive` + `terraform validate` (after `./scripts/tf-init.sh` for the stack) → PASS.
- [ ] **Step 5:** Commit `feat(mesh): wire pricing+gateway into platform stack behind enable_mesh`.

### Task 1.9: mesh.yml CI workflow (matrix skeleton)

- [ ] **Step 1:** Create `.github/workflows/mesh.yml` with a matrix over `{service, lang}` initially `{api-gateway:node, pricing:go}`. Per-lang steps: setup toolchain, install, lint, test+coverage gate, `docker build`, Trivy image scan. Push gated on the same OIDC/branch conditions as `app.yml`.
- [ ] **Step 2:** `actionlint .github/workflows/mesh.yml` → no errors.
- [ ] **Step 3:** Extend `scripts/validate-k8s-manifests.sh` to also render+validate `apps/{api-gateway,pricing}/k8s`.
- [ ] **Step 4:** Commit `ci(mesh): polyglot build/test/scan matrix (gateway+pricing)`.

### Phase 1 exit criteria
- `cd apps/pricing && go test ./...` green; `cd apps/api-gateway && npm test && npm run contract-check` green.
- `terraform validate` green for `stacks/platform` with `enable_mesh` plumbing.
- `actionlint` clean. Manifests kubeconform-valid.
- Conceptually: gateway `/v1/order` → pricing `/quote` is a 2-service trace.

---

## PHASE 2 — mesh-fill (task list)

Add the remaining sync services, each following the Phase-1 template for its language. For each: core logic + test → HTTP server (healthz/readyz/metrics + functional route) + test → OTel → Dockerfile → k8s → wire into `modules/mesh` instance in `stacks/platform` → add to `mesh.yml` matrix → contract-check (Node). Gateway fan-out extended to call each new hop in the `place-order` path.

- **Task 2.1 inventory (Python/FastAPI):** `apps/inventory/` — `POST /reserve {items}` → `{reserved:bool, lines}`; pytest; OTel via `libraries/python/logs` + `opentelemetry-instrumentation-fastapi`; Dockerfile `python:3.12-slim` non-root; k8s; matrix `inventory:python`.
- **Task 2.2 fraud (Java/Spring Boot):** `apps/fraud/` — `POST /score {order}` → `{score:0-100, decision}`; JUnit; OTel java agent or `libraries/java/logs`; Dockerfile `eclipse-temurin:17-jre` non-root; k8s; matrix `fraud:java`. Coverage gate mirrors `libraries/java`.
- **Task 2.3 payment (Node):** `apps/payment/` — `POST /authorize {amount_cents, tenant_id}` → `{auth_id, status}`, then calls ledger; mirror order-api Node template; HMAC to ledger.
- **Task 2.4 ledger (Go):** `apps/ledger/` — `POST /entries {auth_id, amount_cents}` → double-entry append (in-memory + optional DB later) → `{entry_id}`; Go template.
- **Task 2.5 projection-worker (Python):** `apps/projection-worker/` — Kinesis consumer (reuse stream from `storefront-events`) building a read-model (in-memory or DynamoDB); exposes `/healthz` + `/metrics`; long-running poller, not HTTP-routed.
- **Task 2.6 gateway deep chain:** extend `api-gateway` `/v1/order` to call pricing → inventory → fraud → payment(→ledger) in sequence with proper context propagation, aggregate the result, and surface partial-failure semantics (per-hop status). Tests stub each hop via `fetchImpl`.
- **Task 2.7:** instantiate all five via `modules/mesh` in `stacks/platform` (each `count = var.enable_mesh`); extend `mesh.yml` matrix to all 7 services.

**Phase 2 exit:** `place-order` produces an 8-span trace across 4 languages; all per-service tests + coverage gates green; `terraform validate` + `actionlint` clean.

---

## PHASE 3 — serverless fan-out (task list)

- **Task 3.1 enrichment-lambda (Node):** `apps/enrichment-lambda/` — Kinesis-triggered; enriches order events and puts them on EventBridge; node:test with a Kinesis record fixture; reuses the `storefront-events` stream.
- **Task 3.2 analytics-lambda (Node):** `apps/analytics-lambda/` — EventBridge-triggered; per-tenant rollups to CloudWatch EMF / metrics; node:test with an EventBridge event fixture.
- **Task 3.3 EventBridge infra:** new `modules/mesh-events/` (or extend `storefront-events`) — EventBridge bus + rules + Lambda permissions + optional SQS DLQ; least-priv IAM; wire into `stacks/platform` behind `enable_mesh`.
- **Task 3.4:** add lambdas to a CI build/test path (extend `app.yml` or `mesh.yml`); ensure both reuse the ECR cache for any base layers.

**Phase 3 exit:** an order event flows Kinesis → enrichment-lambda → EventBridge → analytics-lambda, visible as async spans linked to the originating trace; lambda tests green.

---

## PHASE 4 — traffic generator (task list)

- **Task 4.1 loadgen core (Node):** `apps/loadgen/` — token-bucket worker pool; `runScenario(name, rps, durationSec)` that fires requests at the gateway with `traceparent`, `x-synthetic:1`, `tenant_id=synthetic-<n>`; scenarios `browse|place-order|burst|mixed|chaos` as weighted request sequences; unit tests for the bucket + scenario selection + clamps.
- **Task 4.2 loadgen control API:** `POST /run`, `POST /stop`, `GET /status`; HMAC-gated (order-api scheme); rps + duration clamped to ceilings (hard caps); only target = in-cluster gateway DNS (no arbitrary URL — SSRF guard) with a test asserting an external URL is rejected.
- **Task 4.3 loadgen Dockerfile + k8s + module:** `modules/loadgen/` — Deployment + control Service + `CronJob` trickle (2–5 rps mixed, no-op if gateway unreachable); wire into `stacks/platform` behind `enable_loadgen`.
- **Task 4.4 loadgen.yml workflow:** `workflow_dispatch` (scenario, rps, duration inputs) firing an on-demand run via the control API or a k8s Job; `actionlint` clean.
- **Task 4.5 chaos scenario:** app-level fault injection only (bad payloads / forced downstream 500 via a gateway test-hook header), with a test. Real pod-killing chaos → backlog row.

**Phase 4 exit:** starting a `place-order` run lights up the full map; trickle CronJob keeps it populated; safety rails tested (SSRF reject, rps clamp).

---

## PHASE 5 — console frontend + BFF (task list)

- **Task 5.1 BFF observe routes:** `apps/storefront/src/app/api/observe/{topology,metrics,traces,logs}/route.ts` — server-side, Cognito-gated (reuse `verifySession`), query Tempo (service graph + trace-by-id), Mimir/Prometheus (instant+range), Loki (recent lines). Env: `TEMPO_URL`, `MIMIR_URL`, `LOKI_URL` (in-cluster DNS). Tests with stubbed upstream fetch. Brief server-side cache.
- **Task 5.2 BFF load routes:** `apps/storefront/src/app/api/load/{run,stop,status}/route.ts` — Cognito-gated; sign requests to loadgen control API with the internal HMAC; clamp inputs again at the BFF.
- **Task 5.3 /console page:** force-graph service map (nodes=services, edges=calls, color=error rate) + headline metrics strip. Built with **frontend-design** matching the dark/aurora aesthetic. Metrics strip subscribes to the existing WebSocket; topology polls `/api/observe/topology`.
- **Task 5.4 /traces page:** recent-traces list → span-tree waterfall (click a trace → `/api/observe/traces?id=`).
- **Task 5.5 /services page:** per-service health grid (up, rps, p95, err, version, lang) from `/api/observe/metrics`.
- **Task 5.6 /load page:** scenario picker + rps dial + duration + Start/Stop + live counters (rps/p95/err/inflight from `/api/observe`).
- **Task 5.7 navbar restructure:** replace commerce cluster with console cluster (Console/Traces/Services/Load); keep platform cluster + `/design`.
- **Task 5.8 security headers:** ensure new routes inherit `next.config.ts` CSP; `connect-src` already allows `self https: wss:`. Add tests in `apps/storefront/test/`.

**Phase 5 exit:** `/console` renders the real map from synthetic traffic; `/load` starts/stops runs; storefront tests + `next build` green; coverage gate held.

---

## PHASE 6 — cleanup + docs (task list)

Deletion rule: remove only after `rg <symbol|path>` shows zero references. Honor every do-not-break tripwire.

- **Task 6.1 remove shop UI:** delete `app/products/**`, `app/cart/**`, `app/checkout/**`, `app/orders/**`, `app/admin/**` and shop-only components (ProductCard, ProductGrid, CartView, CheckoutButton, AddToCartButton, OrderStatusPill, Pagination, SearchBar, admin/ImageUploader). `rg` each before delete.
- **Task 6.2 remove admin upload:** delete `app/api/admin/upload/route.ts` + `components/admin/ImageUploader.tsx`; `rg` `upload` for stragglers.
- **Task 6.3 retire storefront-assets module:** `rg storefront[_-]assets` across `stacks/`, `main.tf`, docs; remove the module + its `stacks/platform` block + vars + outputs only when references are zero. Update `modules.json` is auto-managed by init — no manual edit.
- **Task 6.4 prune dead lib code:** remove `lib/cart.ts` and shop-only helpers once `rg` confirms no importers remain post-UI-removal.
- **Task 6.5 update CLAUDE.md:** Current State (new services + pipeline order `…→ database → mesh → loadgen → …`), env-var contract (new Node services), Do-Not-Break additions (mesh HMAC, loadgen SSRF guard, synthetic-tenant tagging), backlog rows for new findings + deferred items (real chaos engineering; budget hard-cap link #139).
- **Task 6.6 docs + ADRs:** new ADRs — mesh module design, polyglot tracing, console BFF, loadgen safety model; update README + `docs/runbooks/*`; update `openapi.yaml` (gateway + service contracts).
- **Task 6.7 update memory:** per the memory rules, note the shop→console pivot in the project memory pointer if non-obvious.

**Phase 6 exit:** `rg` shows no dangling refs to removed files; `next build` + all service builds green; docs reflect new architecture.

---

## PHASE 7 — comprehensive review (task list)

- **Task 7.1 code review:** `/code-review` high effort over the full branch diff + manual per-language pass (Go error handling/context, Python typing/async, Java idioms, Node leaks). File findings as backlog rows.
- **Task 7.2 security review:** `/security-review` — authn/authz on every new endpoint, HMAC on internal hops, BFF never leaks observability creds, loadgen un-weaponizable, synthetic-tenant isolation, NetworkPolicies present on all mesh services.
- **Task 7.3 vuln scan:** `npm audit` (node svcs), `govulncheck ./...` (go), `pip-audit` (python), Trivy/OWASP dep-check (java + all images), `trivy fs` + `trivy image`.
- **Task 7.4 automation audit:** `actionlint` all workflows; OIDC least-priv; no hardcoded ARNs; matrix correctness; per-language coverage gates enforced; drift-detection covers new resources; contract-check extended to every Node service.
- **Task 7.5 best-practices sweep:** consistent OTel resource attrs across langs; structured logging + redaction everywhere; healthz/readyz on every service; graceful shutdown; resource limits set; PodSecurity/securityContext uniform; images pinned via ECR cache.
- **Task 7.6 fix + verify:** fix all P1/P2; triage P3/P4 into backlog; run the full validation suite (Terraform fmt/validate/tflint, all app tests, contract-check, k8s validate, actionlint); confirm green before any PR.

**Phase 7 exit:** P1/P2 findings resolved; verification suite green; branch merge-ready.

---

## Self-review notes
- **Spec coverage:** §1 mesh → P1–P2; §2 console → P5; §3 traffic gen → P4; §4 infra → P1.7–1.9 + per-phase wiring; §5 cleanup → P6; §6 review → P7. All sections mapped.
- **Type consistency:** `LineItem`/`QuoteResult` (Go) used consistently; gateway `fetchImpl` injection used in all Node fan-out tests; `createApp(deps)` factory pattern matches order-api across Node services; `modules/mesh` var names reused in §1.8/2.7.
- **No placeholders in Phase 1** (executed now); Phases 2–7 are task lists with concrete endpoints/files — these get expanded to full TDD steps at execution time per phase, consistent with the build-first directive.
