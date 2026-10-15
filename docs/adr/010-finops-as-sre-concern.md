# ADR 010 — FinOps as an SRE Concern

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

Cost management in cloud infrastructure is typically the domain of a Finance or FinOps team: they set budgets, review invoices, and optimize reserved instance coverage. SRE teams focus on reliability, latency, and error rates.

This separation creates a blind spot: the infrastructure decisions SRE teams make — instance types, data retention periods, NAT gateway configurations, idle deployment lifetimes — are the primary drivers of cloud cost. Finance can see the output (the bill) but not the cause. SRE can see the cause but isn't incentivized to look at the output.

CloudOps is a single-person SRE project, which eliminates the organizational boundary problem. But it raised a design question: should cost be treated as an operational metric alongside uptime and latency, or managed separately as a financial concern?

## Decision

We treat cost as an SRE metric. The FinOps module (`modules/finops/`) is deployed alongside the operational modules, cost data flows into the same observability pipeline as reliability data, and cost anomalies are surfaced as operational alerts through the same SNS/Lambda/Grafana path as latency and error rate alerts.

**Cost overruns cause incidents.** A budget exhaustion at month end typically results in escalation, emergency freeze on deployments, and investigation work that pulls engineers away from other priorities. In the worst case (for startups or individual accounts), services can be throttled or suspended. Treating a budget breach as an operational incident — with an SNS alert, a Grafana panel, and a runbook — means it's detected and acted on before escalation, not after.

**Idle resources indicate reliability problems.** The idle resource detector Lambda (`modules/finops/idle_detector.tf`) checks EKS node CPU utilization (<10% average over 24 hours) and RDS database connections (<5 connections over 24 hours). An idle EKS cluster is not just a cost waste — it likely means no traffic is flowing, which means either the application is down or the load balancer is misconfigured. An RDS instance with zero connections for 24 hours may mean the application is running in a broken state with a connection pool timeout that's silently discarding requests.

Both of these reliability signals are surface-level indicators; they don't prove a problem, but they're cheap to check and worth surfacing.

**Budget utilization as an SLI.** The FinOps module creates an AWS Budgets alert at 80% ($40) and 100% ($50) of the monthly budget. These are soft SLIs: staying under the 80% threshold means the infrastructure is operating within its designed cost envelope. Exceeding 100% means something unexpected has happened — a data transfer spike, an idle resource left running, or a new module deployed without cost review.

The CI/CD pipeline enforces this: `modules/infra.yml` runs Infracost on every PR and fails the pipeline if the monthly cost increase exceeds $50. This is a hard gate: a PR that would add more than $50/month cannot be merged without explicitly overriding the threshold. The Infracost comment on the PR shows the full cost breakdown before code review — cost becomes a pull request review criterion alongside correctness and security.

**Shared observability pipeline.** Cost anomaly alerts flow through the same SNS topic pattern as security alerts. The FinOps Grafana dashboard (`modules/finops/dashboard.tf`) lives alongside the SLO dashboard, security posture dashboard, and self-healing dashboard — all visible in the same Grafana instance. An engineer monitoring an incident can check cost trends on the same screen as error rates, which matters when the incident is "we're getting hammered by traffic" — is it malicious (security concern), legitimate (reliability concern), or creating a cost spike (FinOps concern)?

## Consequences

**Positive:**
- Cost anomalies detected before end-of-month invoice review — ops-level response time rather than finance-level review cadence
- Idle resource detection doubles as a primitive availability check for EKS and RDS
- PR-level cost gate (`>$50/month increase fails CI`) prevents cost regressions from being merged silently
- AWS Budgets at $40/$50 provides a hard backstop independent of the application-level monitoring
- Cost data in the same Grafana instance as reliability data — no context switch during incident investigation

**Negative:**
- The $50 monthly budget is appropriate for a dev environment with selective module toggles; a production deployment with all modules enabled (EKS, RDS, NAT gateways, Fargate for Lambda) would need the budget ceiling raised before any PR could be merged
- Infracost requires an API key (`INFRACOST_API_KEY` secret) and accurate resource pricing data. If Infracost's pricing catalog is stale or doesn't cover a resource type (e.g., a new Lambda pricing tier), the gate may produce false passes or false failures
- Treating idle resources as reliability signals can produce false positives in genuine low-traffic periods (nights, weekends for a business-hours application). Threshold tuning (`<10% CPU for 24 hours`) may need adjustment for deployment-specific traffic patterns
- AWS Cost Explorer data has a 24-hour delay — the cost ingestion Lambda sees yesterday's costs, not today's. A cost spike that starts today won't appear in Grafana until tomorrow
