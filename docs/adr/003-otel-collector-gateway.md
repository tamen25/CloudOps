<!-- This document explains 003 OTel collector gateway for CloudOps. -->
# ADR 003 — OTel Collector in Gateway Mode with Bearer Auth

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

The order-api emits three signal types: traces (via the `./tracing` module that patches Node.js before any other require), metrics (via `prom-client`), and logs (via `pino`). These need to reach Tempo (traces), Prometheus (metrics), and Loki (logs) respectively.

The direct approach would have each signal go straight to its backend:
- Traces: SDK export directly to Tempo
- Metrics: Prometheus scrapes the `/metrics` endpoint
- Logs: stdout captured by Fluent Bit or a log shipper

The direct approach works, but it scatters backend addresses across every service that emits telemetry, requires each service to be individually configured when backends change, and provides no central point for auth enforcement, batching, or signal enrichment.

We also had a secondary requirement: Falco runtime findings needed to reach Loki using the same log pipeline, without Falco knowing about Loki at all. Falco runs in its own namespace and Falcosidekick can POST to an HTTP endpoint — it does not speak the Loki push API directly.

## Decision

We deploy the OTel Collector in **gateway mode** (a Deployment with `replicaCount=2`, not a DaemonSet) and route all telemetry signals — traces, metrics, and logs — through it as the single telemetry ingress point.

The collector configuration in `modules/observability/otel_collector.tf` implements three pipelines:

```
receivers: [otlp]  →  processors: [memory_limiter, resource, batch]  →  exporters: [tempo/prometheus/loki]
```

The `resource` processor injects `cluster` and `environment` as resource attributes on every span, metric, and log line in flight, without any service needing to know about these attributes. This is the "enrichment without code change" argument for a gateway: a new environment label propagates by updating the collector config, not by redeploying every service.

**Bearer auth:** The collector mounts a Kubernetes Secret (`otel-auth`) as a file at `/etc/otel/auth/api-key` and uses the `bearertokenauth` extension on both the gRPC (4317) and HTTP (4318) receivers. This means every SDK client must present a bearer token to send telemetry. Falcosidekick injects the same token via the `FALCOSIDEKICK_WEBHOOK_CUSTOMHEADERS` environment variable read from a local secret copy in the `falco` namespace. The token is generated once by Terraform in `modules/observability/secrets.tf`, then distributed to Kubernetes Secrets, Secrets Manager, and, when enabled, SSM Parameter Store for SDK/client discovery.

The OTel Collector is exposed externally at `otel.example.com` via two Ingress resources — one for HTTP/OTLP (`backend-protocol=HTTP`) and one for gRPC/OTLP (`backend-protocol=GRPC`). External SDK clients (e.g., an application running outside the cluster) can send telemetry over HTTPS without knowing which specific backend stores which signal type.

When `publish_otel_ssm_config=true`, producer accounts can read the base
endpoint and OTLP/HTTP signal-specific URLs from SSM:
`/cloudops/<env>/otel/endpoint`,
`/cloudops/<env>/otel/endpoint/metrics`,
`/cloudops/<env>/otel/endpoint/traces`,
`/cloudops/<env>/otel/endpoint/logs`, and the SecureString token at
`/cloudops/<env>/otel/api-key`. This is only a configuration distribution
contract; SDK wrappers and custom telemetry libraries remain application-side.

The "backend agnosticism" argument proved its value when we added Tempo: the order-api tracing module only needed the collector endpoint, not the Tempo endpoint. If we replace Tempo with Jaeger tomorrow, only the collector exporter config changes.

## Consequences

**Positive:**
- Single telemetry endpoint for all services: `http://opentelemetry-collector.monitoring.svc.cluster.local:4318`
- Auth enforced centrally: revoking the bearer token disables all telemetry ingestion simultaneously (useful for incident containment)
- Falco findings flow into Loki without Falcosidekick needing Loki-specific configuration
- `resource` processor ensures `cluster=cloudops-dev-cluster` and `environment=dev` appear on every signal without per-service config
- Batching (`timeout=5s`, `send_batch_max_size=1000`) absorbs traffic spikes before they reach Prometheus or Loki
- Backend swap (e.g., Loki → Grafana Cloud) requires only collector exporter changes

**Negative:**
- The collector is a single point of failure for all observability signals. With `replicaCount=2` this is mitigated, but if both collector pods are unhealthy, traces and logs are dropped. Metrics survive because Prometheus can still scrape `/metrics` directly on the pod.
- Cold start on the collector (e.g., after a rollout) causes a brief window where SDK clients buffer or drop telemetry. The SDK retry policy determines how much is preserved.
- Bearer token rotation requires restarting both the collector (to reload the mounted secret) and Falcosidekick. This is a minor operational inconvenience.
- Gateway mode means the collector itself consumes cluster resources (CPU/memory) for batching and routing. DaemonSet mode would distribute this cost to nodes; gateway mode concentrates it in 2 pods.
