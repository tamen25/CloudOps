# Runbook: SLO Availability Fast Burn

## Overview

A **fast burn** alert fires when the availability error budget is being consumed at more than **14.4× the allowed rate**. At this pace the entire 30-day budget is exhausted in roughly **2 hours**. This is a **page-worthy incident** requiring immediate investigation.

The alert is confirmed across two windows (1h long + 5m short) to eliminate false positives from transient spikes. If both windows show burn rate > 14.4×, the impact is real and sustained.

**Budget math:**
- 30-day error budget for 99.9% SLO = 0.1% of requests = ~43.8 minutes of full downtime
- At 14.4× burn rate: 43.8 min ÷ 14.4 = ~3 minutes to consume 1/30th of the monthly budget per 5-minute window
- Action window before budget exhaustion at this rate: ~2 hours

---

## Severity

| Field | Value |
|---|---|
| Severity | **critical** |
| Alert name | `SLOAvailabilityFastBurn` |
| Response time | Immediate — wake someone up |
| Automation | EventBridge triggers Lambda every 5 min; CloudWatch publishes `BurnRate1h` |

---

## Detection

**Grafana SLO dashboard:** `https://grafana.<your-domain>/d/slo-dashboard`

The alert fires from the PrometheusRule CRD defined in `modules/observability/slo.tf`:

```promql
((1 - job:slo_availability:ratio_rate1h{service="order-api"}) / (1 - 0.9990)) > 14.4
AND
((1 - job:slo_availability:ratio_rate5m{service="order-api"}) / (1 - 0.9990)) > 14.4
```

You will also see:
- **CloudWatch alarm** on `BurnRate1h` metric in `CloudOps/SLO` namespace
- **Grafana "Firing SLO Alerts"** panel in the bottom row of the SLO dashboard
- **PagerDuty / Alertmanager** notification via the `cloudops` team route

---

## Triage

Work through these steps **in order**. Stop at the first step that reveals the cause.

### Step 1 — Confirm the error rate in Grafana

Open the order-api RED dashboard and check the current 5xx rate:

```
Grafana → order-api RED dashboard → "Error Rate" panel → set window to "Last 15m"
```

If the error rate is genuinely elevated (> 0.1%), proceed to step 2. If the error rate has already recovered, the alert may be trailing — check if the burn rate is still > 14.4× before escalating.

### Step 2 — Check recent deployments

A new rollout is the most common cause of a fast burn.

```bash
kubectl rollout history deployment/order-api -n cloudops
```

Expected output shows recent revisions with CHANGE-CAUSE. If a deployment happened within the last 30 minutes, that is the likely root cause — go directly to [Resolution: Rollback](#rollback).

```bash
# Check the current rollout status
kubectl rollout status deployment/order-api -n cloudops

# Describe the deployment to see image and env changes
kubectl describe deployment order-api -n cloudops | grep -A5 "Image\|Environment"
```

### Step 3 — Check RDS connections and query latency

A database overload can cause cascading 5xx errors.

1. Open **CloudWatch → Alarms** and look for any alarms in the `cloudops` namespace related to `DatabaseConnections`, `CPUUtilization`, or `FreeStorageSpace`.
2. Open **RDS → Performance Insights** for the `cloudops` database instance.
3. Look for:
   - Connection count spike (normal: < 50, concern: > 100 for db.t3.micro)
   - Long-running queries (> 5s)
   - Lock wait events

If RDS is the bottleneck, check whether a migration or batch job was triggered around the time the alert fired.

### Step 4 — Check OTel traces in Tempo (5xx traces)

Traces show which endpoint and which downstream dependency is causing failures.

```
Grafana → Explore → datasource: Tempo
TraceQL: { span.http.status_code >= 500 && resource.service.name = "order-api" }
```

Or use the service map:
```
Grafana → Explore → Tempo → Service Map → click order-api → filter by error rate
```

Look for:
- Which HTTP endpoints are returning 5xx
- Which span in the trace is the root cause (database call? external API? internal panic?)
- Whether errors are concentrated in one operation or spread across all requests

### Step 5 — Check Loki logs for errors

```
Grafana → Explore → datasource: Loki
LogQL: {namespace="cloudops"} |= "error" | json | level="error"
```

Narrow by pod if Tempo identified a specific instance:
```
LogQL: {namespace="cloudops", pod=~"order-api-.*"} |= "error" | json
```

Look for:
- Stack traces or panic messages
- Connection refused / timeout errors to downstream services
- Out-of-memory kills (`OOMKilled` in pod events)

```bash
# Check pod events for OOM or crash loops
kubectl get events -n cloudops --sort-by='.lastTimestamp' | grep -i "order-api\|error\|kill\|oom"
kubectl get pods -n cloudops | grep order-api
```

---

## Resolution

### Rollback

If a bad deployment is confirmed as the cause:

```bash
kubectl rollout undo deployment/order-api -n cloudops
```

Monitor recovery:
```bash
# Watch pod rollout
kubectl rollout status deployment/order-api -n cloudops

# Tail logs to confirm errors have stopped
kubectl logs -f -l app=order-api -n cloudops --tail=50
```

The error rate should drop within 2–3 minutes of a successful rollback. The burn rate alert will resolve once both the 1h and 5m windows fall below 14.4×.

### Other fixes

| Root cause | Resolution |
|---|---|
| RDS connection exhaustion | Restart order-api pods to release connections; review connection pool config |
| High query latency | Kill long-running queries in RDS; add index if missing; scale up instance class |
| Downstream dependency failure | Add circuit breaker config; confirm external API is healthy |
| Traffic spike | Scale horizontally: `kubectl scale deployment/order-api -n cloudops --replicas=N` |
| Memory leak / OOM | Restart pods; open a bug; set memory limits if not already set |

---

## Silencing the Alert While Investigating

If you need to silence the Alertmanager alert to avoid noise during a controlled investigation:

1. Open **Grafana → Alerting → Silences → New silence**
2. Set matchers:
   - `alertname = SLOAvailabilityFastBurn`
   - `service = order-api`
3. Set duration: **2 hours** (re-evaluate before expiry)
4. Add comment: your name + incident ticket number

**Do not silence for more than 2 hours without opening an incident ticket.**

---

## Escalation Path

| Time without resolution | Action |
|---|---|
| 0–15 min | On-call engineer investigates |
| 15–30 min | Escalate to service owner / lead engineer |
| 30–60 min | Escalate to engineering manager; consider customer communication |
| > 60 min | Incident commander takes over; all-hands war room |

---

## Post-Incident: Recalculating the Error Budget

After the incident window is closed, recalculate how much budget was consumed:

```promql
# Error budget consumed during the incident window (replace timestamps)
1 - (
  sum(increase(http_requests_total{job="order-api", status!~"5.."}[Xh]))
  /
  sum(increase(http_requests_total{job="order-api"}[Xh]))
)
```

Where `Xh` covers the incident duration. Divide by the 30-day error budget fraction (`0.001` for 99.9% SLO) to get the budget fraction consumed.

Record the budget consumed in the post-incident review and update the error budget tracking sheet. If the incident consumed > 50% of the monthly budget, a **reliability sprint** should be scheduled before the next release cycle.

---

## Prevention

- Add smoke tests to the CI/CD pipeline that must pass before production rollout
- Enable **progressive delivery** (canary) to catch regressions before 100% rollout
- Set `minReadySeconds` and `maxUnavailable: 0` in the Deployment spec to slow rollouts
- Add RDS Connection and CPU alarms with SNS notifications
- Review Tempo p99 latency trends weekly in the SLO dashboard

---

## Related Alerts

| Alert | Description |
|---|---|
| `SLOAvailabilityFastBurn` | This runbook |
| `SLOAvailabilitySlowBurn` | Budget burning at 6× rate — see [slo-slow-burn.md](./slo-slow-burn.md) |
| `SLOAvailabilityBudgetCritical` | < 10% budget remaining — see [error-budget-exhausted.md](./error-budget-exhausted.md) |

## Related Dashboards

| Dashboard | URL |
|---|---|
| SLO Dashboard | `https://grafana.<your-domain>/d/slo-dashboard` |
| order-api RED Dashboard | `https://grafana.<your-domain>/d/order-api-red` |
| Tempo Service Map | Grafana → Explore → Tempo → Service Map |
| RDS Performance Insights | AWS Console → RDS → cloudops-dev → Performance Insights |
