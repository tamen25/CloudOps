# Runbook: Error Budget Exhausted

## Overview

The error budget has reached 0% (or gone negative — meaning actual availability fell below the SLO target for the 30-day window). This is the most severe SLO state and represents a **broken reliability contract**.

When the budget hits 0:
1. The `SLOAvailabilityBudgetCritical` alert fires (< 10% remaining)
2. The CI/CD budget gate blocks non-critical deployments automatically
3. The team enters a **reliability sprint** — reliability work takes priority over feature development until the budget is restored

**This is not an incident on its own** — it is the accumulated result of unresolved fast and slow burns. The goal now is to prevent further consumption, restore availability, and rebuild the budget over the next 30-day rolling window.

---

## Severity

| Field | Value |
|---|---|
| Severity | **critical** (< 10% budget) |
| Alert names | `SLOAvailabilityBudgetCritical`, `SLOLatencyBudgetCritical` |
| Response time | Immediate escalation; reliability sprint begins next business day |
| Deployment status | **Frozen** for non-critical changes |

---

## Detection

**Grafana SLO dashboard:** `https://grafana.<your-domain>/d/slo-dashboard`

The budget critical alert fires from `modules/observability/slo.tf`:

```promql
job:slo_error_budget:availability_remaining{service="order-api"} < 0.10
```

The error budget remaining is also visible as:
- **"Error Budget Remaining"** stat panel (top row of SLO dashboard) — red background
- **"Error Budget Remaining % (CloudWatch)"** time series — line dropped to < 10%
- **"Error Budget Consumed" bar gauge** — availability bar showing > 90%
- **CloudWatch metric** `ErrorBudgetRemaining` in `CloudOps/SLO` namespace (published by Lambda)

A value of exactly `0` means the 30-day availability equals the SLO target (budget spent but not breached). A **negative value** means the SLO was actually breached — actual availability < 99.9% over the rolling 30 days.

---

## Triage

### Step 1 — Determine if there is an active incident

Check whether the budget was exhausted by a single large incident or accumulated from many small burns:

```
Grafana → SLO Dashboard → "Error Budget Remaining % (CloudWatch)" panel → set time range to 30d
```

Look at the shape of the decline:
- **Cliff drop** in the last few days → single large incident, likely resolved, budget just hasn't recovered yet
- **Gradual decline over weeks** → systematic reliability problem; no single incident to fix
- **Still declining right now** → active incident; resolve it first before worrying about budget recovery (see [slo-fast-burn.md](./slo-fast-burn.md))

```bash
# Confirm whether there is currently an elevated error rate
kubectl exec -n cloudops deploy/order-api -- \
  wget -qO- localhost:3000/metrics 2>/dev/null | grep 'http_requests_total{.*status="5'
```

### Step 2 — Review the last 30 days of SLO events

The DynamoDB table `cloudops-error-budgets` stores every Lambda execution for the past 90 days. Use the **"Last 10 SLO Events"** table on the SLO dashboard for a quick view, or query directly:

```bash
aws dynamodb query \
  --table-name cloudops-error-budgets \
  --key-condition-expression "slo_name = :slo" \
  --expression-attribute-values '{":slo": {"S": "order-api-availability"}}' \
  --scan-index-forward false \
  --limit 100 \
  --query 'Items[*].{ts: timestamp.S, budget: error_budget_remaining.N, burn1h: burn_rate_1h.N}' \
  --output table
```

Identify the timestamps where `burn_rate_1h` was > 14.4 (fast burns) and where `error_budget_remaining` dropped the most — these are your incidents to post-mortem.

---

## Deployment Freeze Policy

### What is blocked

When `job:slo_error_budget:availability_remaining < 0.10`, the CI/CD budget gate in `.github/workflows/infra.yml` blocks the `deploy` job for non-critical changes. Specifically, the `check-budget` step will exit non-zero and prevent the deployment from proceeding.

**Blocked:**
- Feature releases
- Non-urgent dependency updates
- Infrastructure experiments
- Configuration changes with unknown risk

**Not blocked (requires explicit override):**
- Security patches (CVE severity: critical/high)
- Hotfixes for active incidents
- Rollbacks (always allowed — these reduce error rate)
- Infrastructure-only changes that do not touch order-api

### How to halt deployments immediately

If the budget gate has not triggered automatically (e.g., a manual deployment is in progress):

```bash
# Cancel any in-progress GitHub Actions deployment run
gh run list --workflow=infra.yml --status=in_progress
gh run cancel <run-id>
```

To pause the deployment workflow at the repo level until the freeze is lifted:

```bash
# Disable the deploy workflow (re-enable when freeze is lifted)
gh workflow disable deploy.yml
```

---

## Requesting an Error Budget Exception

An exception allows a specific deployment to proceed despite the budget gate. Use this only for security patches, hotfixes, or changes that are themselves expected to **improve** reliability.

### Process

1. Open a GitHub issue using the **budget-exception** template with:
   - Change description and justification
   - Expected reliability impact (positive or neutral)
   - Rollback plan if the change causes regressions
   - Approval from the service owner and an SRE

2. Once approved, use the `override_budget_check` workflow input:

```bash
gh workflow run infra.yml \
  --ref feature/my-fix \
  --field override_budget_check=true \
  --field override_reason="Security patch CVE-2024-XXXXX — approved by @owner in issue #NNN"
```

The override is logged in the GitHub Actions run summary. **All overrides are audited.**

### Override responsibly

- An override for a change that **increases** error rate will make the budget worse — you will owe the reliability time back
- Never use an override to ship a feature under deadline pressure — that is not what exceptions are for
- If you find yourself requesting exceptions regularly, the problem is the product roadmap, not the override process

---

## Recovery: Restoring the Error Budget

The error budget is a 30-day rolling window. You cannot "pay back" past errors — you can only stop adding new ones. Budget recovers as the rolling window slides past old incidents.

### How long recovery takes

If a 2-hour full-outage incident occurred 10 days ago:
- The incident consumed 2 hours out of 43.8 minutes allowed = ~275% of the monthly budget
- That incident exits the 30-day window in 20 more days
- **Until then**, the availability must be perfect (100%) to avoid making it worse

To check when a specific incident window exits the rolling 30d:

```bash
# Find the timestamp of the incident in DynamoDB
# Then: recovery_date = incident_start + 30 days
```

### What availability % is needed to restore budget

The 30-day error budget is `(1 - SLO_target) * 30 * 24 * 60` minutes = **43.8 minutes** of allowed downtime for 99.9%.

If the budget is at -X% (breached), you need **zero additional errors** for the next:

```
recovery_hours = X * 43.8 minutes / (1 - current_error_rate)
```

Practically: if the current error rate is back to 0, the budget will recover naturally as the old incident slides out of the 30-day window. If the error rate is still elevated, the budget will continue to decline.

**Check recovery progress daily:**
```
Grafana → SLO Dashboard → "Error Budget Remaining % (CloudWatch)" → time range: 7d
```

The line should be trending upward (or flat, if an incident just exited the window).

### Reliability sprint goals

During the freeze, the team commits to:

1. **Post-mortem** every incident that consumed > 5% of the monthly budget — document in `docs/post-mortems/`
2. **Fix the top 3 reliability gaps** identified in the post-mortems before any feature work resumes
3. **Review SLO targets** — if the budget is consistently exhausted, the target may be set too aggressively for the current architecture
4. **Add regression tests** that would have caught the incidents before production deployment

The freeze lifts when:
- `job:slo_error_budget:availability_remaining > 0.50` (50% budget remaining)
- At least one week of sustained availability at or above SLO target
- Service owner and SRE sign off

---

## Prevention

- Treat every fast burn alert as a must-fix that day, not a "we'll look at it later" — slow burns that go unresolved become budget exhaustion
- Run chaos engineering exercises (pod kill, network partition, DB failover) in staging to discover failure modes before they hit production
- Review the 30-day error budget trend every Monday in the team standup — catching a downward trend early avoids emergencies
- Add a **budget burn rate pre-check** to your deployment checklist: if `BurnRate6h > 2` when you are about to deploy, pause and investigate first
- Set a **non-paging warning** alert at 50% budget remaining (`SLOAvailabilityBudgetLow`) so the team has two weeks of lead time

---

## Related Alerts

| Alert | Description |
|---|---|
| `SLOAvailabilityBudgetCritical` | This runbook (< 10% budget) |
| `SLOAvailabilityBudgetLow` | < 50% budget — earlier warning; same recovery steps apply |
| `SLOAvailabilityFastBurn` | The likely cause — see [slo-fast-burn.md](./slo-fast-burn.md) |
| `SLOAvailabilitySlowBurn` | Contributing cause — see [slo-slow-burn.md](./slo-slow-burn.md) |
| `SLOLatencyBudgetCritical` | Latency budget exhausted — same process applies to latency SLO |

## Related Dashboards

| Dashboard | URL |
|---|---|
| SLO Dashboard (30d view) | `https://grafana.<your-domain>/d/slo-dashboard` — set time range to 30d |
| DynamoDB SLO History | AWS Console → DynamoDB → `cloudops-error-budgets` → Explore items |
| GitHub Actions — infra.yml | `https://github.com/your-org/your-repo/actions/workflows/infra.yml` |
