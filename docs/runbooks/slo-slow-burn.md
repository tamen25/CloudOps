<!-- This document explains SLO slow burn for CloudOps. -->
# Runbook: SLO Availability Slow Burn

## Overview

A **slow burn** alert fires when the availability error budget is being consumed at more than **6× the allowed rate**, confirmed across two windows (6h long + 30m short). At this pace the entire 30-day budget is exhausted in roughly **5 days**.

This is **not a page** — it is an urgent ticket that must be resolved within the same business day. Left unattended, it will become a fast burn or exhaust the budget entirely, triggering the harder `SLOAvailabilityBudgetCritical` alert and potentially a deployment freeze.

**Budget math:**
- 30-day error budget for 99.9% SLO = 43.8 minutes of full downtime equivalent
- At 6× burn rate: budget exhausts in 30 days ÷ 6 = 5 days
- You have hours, not minutes — but do not wait until tomorrow

---

## Severity

| Field | Value |
|---|---|
| Severity | **warning** |
| Alert name | `SLOAvailabilitySlowBurn` |
| Response time | Same business day; within 4 hours |
| Automation | `SLOAvailabilitySlowBurn` + CloudWatch `BurnRate6h` metric |

---

## Detection

**Grafana SLO dashboard:** `https://grafana.<your-domain>/d/slo-dashboard`

The alert fires from the PrometheusRule CRD in `modules/observability/slo.tf`:

```promql
((1 - job:slo_availability:ratio_rate6h{service="order-api"}) / (1 - 0.9990)) > 6
AND
((1 - job:slo_availability:ratio_rate30m{service="order-api"}) / (1 - 0.9990)) > 6
```

The 6h + 30m window combination means the elevated error rate must have been present for at least 30 minutes **and** shows the same trend over 6 hours. A burst spike that already recovered will not trigger this alert.

You will also see:
- **"Burn Rate 1h & 6h"** time series panel on the SLO dashboard showing the 6h line above the orange threshold
- **CloudWatch metric** `BurnRate6h` in `CloudOps/SLO` namespace trending above 6
- **Grafana "Firing SLO Alerts"** panel listing `SLOAvailabilitySlowBurn`

---

## Triage

### Step 1 — Characterise the error pattern

Before diving into individual systems, understand the shape of the problem.

```
Grafana → SLO Dashboard → "Availability SLI over Time" panel → set window to "6h"
```

Ask:
- Is the error rate elevated but stable (e.g., 0.2% steady-state), or slowly worsening?
- Is it affecting all requests or a subset?
- Did it start at a specific time? (correlate with deployments, cron jobs, business hours)

```bash
# Quick check: recent error counts by HTTP status
kubectl exec -n cloudops deploy/order-api -- \
  wget -qO- localhost:3000/metrics 2>/dev/null | grep http_requests_total
```

### Step 2 — Check memory and CPU trends

Slow burns are often caused by resource exhaustion that degrades gradually rather than causing an immediate outage. Memory leaks are a classic cause — the pod runs, but under memory pressure it starts to slow down and occasionally crash.

```bash
# Check memory and CPU usage across order-api pods
kubectl top pods -n cloudops -l app=order-api

# Check for OOMKilled restarts — column RESTARTS should be 0 or low
kubectl get pods -n cloudops -l app=order-api

# Check recent restarts and their reasons
kubectl describe pods -n cloudops -l app=order-api | grep -A5 "Last State\|Reason\|Exit Code"
```

In Grafana:
```
Explore → Prometheus
Query: container_memory_working_set_bytes{namespace="cloudops", pod=~"order-api-.*"}
Query: rate(container_cpu_usage_seconds_total{namespace="cloudops", pod=~"order-api-.*"}[5m])
```

Watch for a memory trend that climbs steadily over hours — that is a leak. CPU spikes that correlate with request rate increases suggest a hot-path performance regression.

### Step 3 — Investigate slow database queries via RDS Performance Insights

Slow queries cause request timeouts and elevated p99 latency, which can push the error rate above the SLO threshold if timeouts return 5xx.

1. **AWS Console → RDS → cloudops-\<env\> → Performance Insights**
2. Set the time range to the last 6 hours
3. Look at **Top SQL** sorted by `db load`:
   - Any query appearing with unusually high load?
   - Are sequential scans appearing on large tables (missing index)?
   - Are there lock waits (`wait/lock/row/read` or `wait/lock/table/write`)?

Common findings and fixes:

| Finding | Investigation | Fix |
|---|---|---|
| Full table scan | `EXPLAIN ANALYZE <query>` in psql | Add index on filter column |
| Lock contention | Check `pg_locks` and `pg_stat_activity` | Review transaction scope; kill blocking query |
| Connection saturation | `SELECT count(*) FROM pg_stat_activity` | Increase pool size or scale order-api pods down to reduce connections |
| Autovacuum lag | `SELECT relname, n_dead_tup FROM pg_stat_user_tables` | Run `VACUUM ANALYZE` manually |

```bash
# Connect to RDS via port-forward through a debug pod (if no direct access)
kubectl run psql-debug -n cloudops --rm -it --image=postgres:15 \
  --env=PGPASSWORD=<from-secrets-manager> \
  -- psql -h <rds-endpoint> -U cloudops -d cloudops \
  -c "SELECT pid, now()-query_start AS duration, state, query FROM pg_stat_activity WHERE state != 'idle' ORDER BY duration DESC LIMIT 10;"
```

### Step 4 — Check upstream dependency latency via Tempo service map

A slow burn is often caused by a dependency that is degraded but not fully down — enough to push tail latency above acceptable levels.

```
Grafana → Explore → datasource: Tempo → Service Map
```

In the service map:
1. Click on **order-api** to see its outbound connections
2. Look for edges where the error rate or p99 latency is elevated
3. Click any elevated edge to drill into example traces

Then open a specific trace:
```
Grafana → Explore → Tempo
TraceQL: { span.http.status_code >= 500 && resource.service.name = "order-api" } | duration > 500ms
```

Look for which span in the trace is adding latency:
- If the root span is slow but all children are fast → CPU-bound issue in order-api itself
- If a database span is slow → RDS issue (back to Step 3)
- If an outbound HTTP span is slow → external dependency degradation

### Step 5 — Correlate logs, traces, and metrics in Grafana

Grafana's Explore split view allows side-by-side analysis. Use this to correlate a specific error type with its logs and traces:

1. Open **Grafana → Explore** and enable the split view (button at top right)
2. **Left panel:** Loki logs
   ```
   LogQL: {namespace="cloudops"} | json | level="error" | line_format "{{.msg}} {{.error}}"
   ```
3. **Right panel:** Tempo traces
   ```
   TraceQL: { span.http.status_code >= 500 }
   ```

Click on a log line that has a `traceID` field — Grafana will auto-link to the corresponding trace. This is the fastest way to go from "something is wrong" to "this specific code path is wrong".

Additional Loki queries for common slow-burn causes:

```
# Timeouts to downstream services
{namespace="cloudops"} |= "timeout" | json

# Slow database queries logged by the app
{namespace="cloudops"} |= "slow query" | json | duration > 1000

# Connection pool exhaustion
{namespace="cloudops"} |= "pool" |= "timeout" | json

# HTTP 429 from rate-limited upstream
{namespace="cloudops"} |= "429" | json
```

---

## Resolution

Slow burns rarely need emergency rollbacks. The appropriate action depends on root cause:

| Root cause | Resolution |
|---|---|
| Memory leak | Rolling restart buys time: `kubectl rollout restart deployment/order-api -n cloudops` — schedule fix for next sprint |
| Missing DB index | Add index in a migration; deploy during low-traffic window |
| DB connection saturation | Tune `DB_POOL_SIZE` env var; redeploy |
| Upstream degraded | Add/tune circuit breaker timeout; open issue with dependency team |
| Gradual traffic growth | Horizontal scale: `kubectl scale deployment/order-api -n cloudops --replicas=N` |
| Background job contention | Move batch job to off-peak hours or a separate worker deployment |

After applying a fix:
1. Watch the **"Burn Rate 1h & 6h"** panel on the SLO dashboard — it should trend down over the next 30–60 minutes
2. The alert will auto-resolve once both windows fall below 6×
3. Do not close the ticket until the burn rate has been below 1× for at least 1 hour

---

## Common Causes and How to Correlate

| Symptom in metrics | Likely cause | Correlation path |
|---|---|---|
| BurnRate6h creeping up over days | Memory leak → periodic OOMKill | `kubectl get pods` RESTARTS column + memory trend in Prometheus |
| Elevated error rate during business hours only | Traffic-correlated resource exhaustion | Compare error rate with `job:slo_throughput:rate5m` in Grafana |
| Errors on specific endpoint only | Regression in one handler; missing index for a filtered query | Tempo TraceQL filtered to that HTTP route |
| Errors after a non-code change (e.g., DB config) | Connection pool misconfiguration | Loki + RDS `pg_stat_activity` |
| Errors correlate with external API calls | Upstream degradation | Tempo service map edge latency |
| Error rate stable but slightly elevated since last deploy | Quiet regression — a new code path that occasionally fails | `kubectl rollout history` + Tempo filtered to new revision |

---

## Prevention

- Set up **synthetic monitoring** (Grafana k6 or AWS CloudWatch Synthetics) to catch regressions before real users do
- Add **query execution time** to application logs for every DB call
- Review Tempo p99 and service map weekly — slow burns often have a precursor signal days before the alert fires
- Enable **RDS Enhanced Monitoring** (already configured at 60s in `terraform.tfvars.example`) and set up a CloudWatch alarm on `DatabaseConnections`
- Track memory trends per pod in the Grafana node exporter dashboard — a leak shows up weeks before it causes a slow burn

---

## Related Alerts

| Alert | Description |
|---|---|
| `SLOAvailabilityFastBurn` | Budget burning at 14.4× rate — immediate page, see [slo-fast-burn.md](./slo-fast-burn.md) |
| `SLOAvailabilitySlowBurn` | This runbook |
| `SLOAvailabilityBudgetCritical` | < 10% budget remaining — see [error-budget-exhausted.md](./error-budget-exhausted.md) |
| `SLOLatencySlowBurn` | Latency SLO burning at 6× rate — same triage process, focus on p99 |

## Related Dashboards

| Dashboard | URL |
|---|---|
| SLO Dashboard | `https://grafana.<your-domain>/d/slo-dashboard` |
| Tempo Service Map | Grafana → Explore → Tempo → Service Map |
| Loki Logs | Grafana → Explore → Loki |
| RDS Performance Insights | AWS Console → RDS → cloudops-\<env\> → Performance Insights |
