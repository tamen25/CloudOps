# Order API

Node.js REST API used as the sample workload for the CloudOps platform. Runs
on EKS, exports Prometheus metrics on an internal port, and emits OpenTelemetry
traces/metrics/logs to an OTel Collector. Persists orders to RDS PostgreSQL.

## Endpoints

Public (behind the ALB Ingress at `https://api.<domain_name>`):

| Method | Path      | Purpose                                          |
|--------|-----------|--------------------------------------------------|
| GET    | `/`       | Service banner                                   |
| GET    | `/health` | Liveness probe — process is alive (no DB touch)  |
| GET    | `/ready`  | Readiness probe — DB reachable                   |
| POST   | `/order`  | Create an order, persist to Postgres             |
| GET    | `/orders` | Return last 100 orders as `{orders, count}`      |

Internal only (separate port, not routed through the Ingress):

| Method | Path       | Port | Purpose                               |
|--------|------------|------|---------------------------------------|
| GET    | `/metrics` | 9090 | Prometheus scrape endpoint            |

`/metrics` is deliberately bound on a second HTTP server so the Ingress cannot
expose it. A Kubernetes `ServiceMonitor` points Prometheus at the `metrics`
Service port.

## Environment variables

| Variable                        | Default           | Purpose                                        |
|---------------------------------|-------------------|------------------------------------------------|
| `PORT`                          | `3000`            | Main HTTP port                                 |
| `METRICS_PORT`                  | `9090`            | Internal Prometheus port                       |
| `NODE_ENV`                      | `dev`             | Used for metric labels and resource attributes |
| `AWS_REGION`                    | `us-east-1`       | AWS region                                     |
| `DB_NAME`                       | `cloudops`        | Postgres database name                         |
| `DB_SECRET_ARN`                 | *required*        | Secrets Manager ARN for DB credentials         |
| `OTEL_EXPORTER_OTLP_ENDPOINT`   | *recommended*     | OTel Collector HTTPS endpoint                  |
| `OTEL_API_KEY`                  | *required if OTel*| Bearer token for OTel Collector                |
| `OTEL_SERVICE_NAME`             | `order-api`       | Service name attribute                         |
| `OTEL_RESOURCE_ATTRIBUTES`      | *see manifests*   | Extra resource attrs (`deployment.environment=…`) |

## Local development

```bash
cd apps/order-api
npm install
npm test          # unit tests via node --test (no AWS needed)
npm start         # starts the server; requires DB_SECRET_ARN + AWS creds
```

Unit tests use `node:test` and inject a mock pool — they don't require a real
database or network.

## Kubernetes manifests

All manifests in `k8s/` use `${VAR}` placeholders so values come from Terraform
outputs instead of hardcodes. Render them with:

```bash
# Export the variables (see scripts/render-k8s.js for the full list)
export ORDER_API_NAMESPACE=cloudops
export ORDER_API_IMAGE=<account>.dkr.ecr.<region>.amazonaws.com/order-api:latest
# … etc

node scripts/render-k8s.js k8s /tmp/order-api-k8s
kubectl apply -f /tmp/order-api-k8s/
```

The app workflow (`.github/workflows/app.yml`) does this automatically using
`terraform output` for the concrete values.

## Observability

- **Metrics**: exported on `:9090/metrics` in Prometheus text format. Counters:
  `http_requests_total`, `http_request_duration_seconds` (histogram), both
  labeled by method/route/status.
- **Traces**: OTel auto-instrumentation in `src/tracing.js` wraps `http`, `pg`,
  and `express` and ships spans to `OTEL_EXPORTER_OTLP_ENDPOINT`.
- **Logs**: structured JSON via `pino` at `info` level by default.

CloudWatch custom metrics are NOT used — all telemetry goes through the LGTM
stack (Loki/Grafana/Tempo/Prometheus) installed by the observability module.

## Deployment

The sample app is wired into two deployment paths:

1. **`.github/workflows/app.yml`** — full CI: tests, Trivy scan, Cosign keyless
   signing, SBOM attestation, rollout with automatic rollback on failure.
2. **`deploy.sh`** — one-click path: if `node`, `docker`, and `kubectl` are
   available locally, deploy.sh will build, push, render, and apply the app
   after the platform is up.

Neither path depends on the other — the app manifests are fully reproducible
from Terraform state in either case.

## Troubleshooting

### Pod CrashLoopBackOff at startup
Usually `DB_SECRET_ARN` unreachable or the IRSA role lacks
`secretsmanager:GetSecretValue`. Check:
```bash
kubectl logs -n <ns> -l app=order-api
kubectl describe pod -n <ns> -l app=order-api
```

### Readiness failing, liveness passing
The process is alive but the DB query in `/ready` is failing. Kubernetes will
remove the pod from the Service endpoints but won't restart it. Check RDS
connectivity (security group, secret contents).

### No traces in Tempo
- Confirm `OTEL_EXPORTER_OTLP_ENDPOINT` is set and reachable from the pod.
- Confirm `OTEL_API_KEY` matches the `otel-auth` secret in the app namespace.
- Check `kubectl logs -n monitoring -l app.kubernetes.io/name=opentelemetry-collector`.

### Metrics missing from Grafana
- The `ServiceMonitor` must have `release: prometheus` as a label — this is
  what the Prometheus operator's `serviceMonitorSelector` matches by default.
- `/metrics` is on the `metrics` Service port (9090), NOT `http` (3000).
