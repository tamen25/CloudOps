# ADR 007 — Multi-Window Burn Rate SLO Alerting

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

The SLO module tracks two SLOs for the order-api:

- **Availability SLO:** 99.9% of requests succeed (30-day error budget: 43.2 minutes of downtime)
- **Latency SLO:** 95% of requests complete in under the p95 threshold (30-day error budget for latency violations)

We needed an alerting strategy that would wake someone up when the SLO was in danger, without generating alert fatigue from transient noise.

The simple approach is a threshold alert: "if the current error rate exceeds 0.1%, page." This triggers constantly from transient 5xx errors (dependency timeouts, pod restarts, rolling deployments) that resolve in seconds and consume a negligible fraction of the error budget. Within a week, on-call engineers start ignoring the alerts.

The Google SRE Workbook (Chapter 5) describes multi-window burn rate alerting as the solution. We implemented it in `modules/slo/lambda_function/index.js` and surface results in Grafana via the SLO dashboard.

## Decision

We implement Google SRE Workbook multi-window burn rate alerting with the following parameters:

| Alert | Short Window | Long Window | Burn Rate | Budget Consumed in |
|-------|-------------|-------------|-----------|-------------------|
| Page (critical) | 5 min | 1 hour | 14.4x | ~2 hours |
| Page (high) | 30 min | 6 hours | 6x | ~5 hours |
| Ticket (medium) | 2 hours | 1 day | 3x | ~10 hours |
| Warning (low) | 6 hours | 3 days | 1x | budget at steady state |

The Lambda queries Prometheus recording rules every 5 minutes. The recording rules (`slo:order_api:error_rate:5m`, `slo:order_api:error_rate:1h`, etc.) pre-compute error rates over multiple windows. The Lambda compares the current burn rate against the thresholds above to determine alert level.

**Why burn rate instead of raw error rate?** A 5% error rate for 30 seconds consumes 0.003% of the monthly error budget — completely irrelevant. A 0.5% error rate sustained for 6 hours consumes 3x the expected hourly budget — genuinely dangerous. Burn rate normalizes error volume by the rate at which the budget is being consumed: a burn rate of 1.0 means you're consuming budget at exactly the rate that would exhaust it at end of month; 14.4x means you'd exhaust the entire monthly budget in 2 hours.

**Why two windows per alert level?** The short window detects fast burns quickly. The long window provides confidence that it's not a transient spike. Both windows must exceed the threshold simultaneously before alerting. This is the "multi-window" in multi-window burn rate: false positive rate drops dramatically because a 5-minute spike won't also show up as elevated in the 1-hour window.

**Error budget gives business context.** A raw alert says "5xx rate is 0.2%." A burn rate alert says "if this continues, you'll exhaust your monthly reliability budget in 5 hours." The second framing gives the on-call engineer and their manager a common language for prioritization: a P2 incident consuming budget at 6x is more urgent than a P3 at 1.5x, regardless of the absolute error counts.

**Cross-module integration.** When the SLO Lambda detects critical burn rate (14.4x), it publishes to the security module's SNS topic (`security_alerts_topic_arn`). This integration, configured in `main.tf` via `security_alerts_topic_arn = var.enable_security ? module.security[0].security_alerts_topic_arn : ""`, means a sustained reliability degradation that could indicate a security incident (e.g., a DDoS causing 5xx floods) appears in the security posture dashboard.

## Consequences

**Positive:**
- Alert fatigue reduction: transient errors that don't threaten the budget don't page anyone
- Alerts are actionable: burn rate directly maps to time remaining before SLO breach
- Business-language framing: "error budget" is understandable to product managers and SRE leadership
- Multi-window requirement (short + long) eliminates most false positives from deployment spikes
- Error budget history stored in DynamoDB (`cloudops-error-budgets`) enables trend analysis

**Negative:**
- More complex to implement than a simple threshold: requires recording rules in Prometheus, multi-window Prometheus queries, and Lambda-side burn rate calculation
- A very sudden complete outage (100% errors) is detected within one 5-minute Lambda invocation window — but multi-window confirms it in 1 hour. If you need sub-minute detection for catastrophic failures, supplement with a simple "error rate > 50% for 1 minute" fast-path alert
- Error budget concept requires buy-in from stakeholders — an on-call engineer unfamiliar with SRE practices needs onboarding before they can interpret burn rate alerts correctly
- Prometheus recording rule failures (e.g., Prometheus down) cause the Lambda to log an error and skip the alert cycle, creating a potential blind spot during observability outages
