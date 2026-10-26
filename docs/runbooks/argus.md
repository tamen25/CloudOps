# Argus engine on the cluster

[Argus](https://github.com/tamen25/Argus) scores a service's telemetry
against the Instrumentation Score spec. It scores the OTLP a collector
mirrors to it, so for this cluster it runs here: Argus on an operator's
machine is out of the collector's reach. `modules/argus`, switched by
`enable_argus` in the platform stack, off by default.

## What turning it on changes

- Namespace `argus`: the engine (`argus serve`), one pod, image
  `ghcr.io/tamen25/argus` at the chart's appVersion. It keeps its state in
  memory: a restart starts the scores from nothing.
- The OTel Collector gets an `otlp/argus` exporter on its traces, metrics
  and logs pipelines. It has its own queue: when the engine is down, only
  the mirror's data is dropped, and Tempo, Prometheus and Loki are
  unaffected.
- A NetworkPolicy on the engine: OTLP only from `monitoring` (the
  collector), the API and `/metrics` only from `monitoring` (Prometheus,
  Grafana) and the engine's own namespace. The OTLP receiver has no
  authentication, so this policy decides who can report telemetry and move
  the scores. VPC CNI enforces it (ADR 012).
- A ServiceMonitor: Prometheus scrapes the score gauges and remote-writes
  them to Mimir with everything else.

## Turn it on

The chart is not published to a registry; it comes from an Argus checkout
(chart 0.3.0 or later: earlier ones bundle a Postgres whose image was
withdrawn). With Argus checked out beside CloudOps:

```hcl
# platform tfvars
enable_argus = true
argus_chart  = "../../../Argus/deploy/helm/argus"   # relative to stacks/platform
```

Apply the platform stack from that machine. CI cannot apply it with
`enable_argus` on: its runners have no Argus checkout.

```bash
kubectl -n argus get pods                       # argus-..., Running and Ready
kubectl -n argus logs deploy/argus | head       # startup errors, if any
```

## Read the scores

In Grafana (Explore, Mimir or Prometheus), once services have sent
telemetry for a scrape interval or two:

```promql
argus_instrumentation_score              # per service, 0–100
argus_instrumentation_score_fleet        # the mean
argus_findings                           # open findings by service and impact
```

The full report, with every finding, is on the engine's API:

```bash
kubectl -n argus port-forward svc/argus 18081:8080 &
TOKEN=$(kubectl -n argus get secret argus -o jsonpath='{.data.api-token}' | base64 -d)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:18081/api/report | jq .
```

## Limits

- Findings carry `confidence: sampled`. `argus serve` scores the mirror; it
  does not poll Mimir to verify findings, as `argus score --mimir-url` does.
- No persistence: scores, findings and aggregates live in the pod.
- The mirror carries everything the collector receives. At this cluster's
  volume that is small; a busy cluster would put a sampler in front of it.

## Turn it off

`enable_argus = false` and apply: the release, its namespace and the
collector's mirror exporter go.
