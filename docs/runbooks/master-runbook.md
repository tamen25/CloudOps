<!-- This document explains master runbook for CloudOps. -->
# CloudOps Master Operations Runbook

**Last updated:** 2026-03-27
**Owner:** Tamen Dutta
**Repo:** https://github.com/your-org/your-repo
**Grafana:** https://grafana.example.com
**Order API:** https://api.example.com

> This is the single document an on-call engineer needs to operate CloudOps. If something is not covered here, open a PR to add it before your next shift ends.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Quick Reference](#2-architecture-quick-reference)
3. [Access Guide](#3-access-guide)
4. [Common Operational Tasks](#4-common-operational-tasks)
5. [Alert Response Matrix](#5-alert-response-matrix)
6. [Deployment Checklist](#6-deployment-checklist)
7. [Incident Response](#7-incident-response)
8. [Disaster Recovery](#8-disaster-recovery)
9. [Contacts and Escalation](#9-contacts-and-escalation)
10. [Glossary](#10-glossary)

---

## 1. System Overview

CloudOps is an AWS infrastructure project that hosts the **order-api** — a Node.js/Express REST service that creates and retrieves orders, backed by an Amazon RDS PostgreSQL database. The API runs as a Kubernetes Deployment on EKS (cloudops-dev-cluster in us-east-1), exposed through an AWS Application Load Balancer via the AWS Load Balancer Controller. All traffic reaches the API over HTTPS at `api.example.com`. The platform includes a full LGTM observability stack (Loki, Grafana, Tempo, Prometheus + OTel Collector) for logs, traces, and metrics; multi-window burn rate SLO alerting for availability (99.9%) and latency (95% of requests under 300ms); an OSS security stack (Falco runtime threat detection, OPA Gatekeeper admission control, kube-bench CIS benchmarking, compliance scanner Lambda); a self-healing controller that automatically responds to CloudWatch Alarms with safe remediations (rollbacks, scale-outs, node replacement); and a FinOps module tracking cost against a $50/month budget. All infrastructure is managed via Terraform; application deploys go through the GitHub Actions App Pipeline (`apps/order-api/**` → `.github/workflows/app.yml`); infrastructure changes go through the Infra Pipeline (`modules/**`, `*.tf` → `.github/workflows/infra.yml`) with a mandatory human approval gate before `terraform apply` runs on main.

---

## 2. Architecture Quick Reference

| Component | What it does | Where it runs | Endpoint / Identifier | Health check |
|-----------|-------------|---------------|----------------------|--------------|
| **order-api** | REST API — POST /order, GET /orders, GET /health | EKS `cloudops` namespace | `https://api.example.com` | `curl https://api.example.com/health` |
| **EKS cluster** | Kubernetes control plane + 2× t3.large managed nodes | AWS EKS, us-east-1 | `cloudops-dev-cluster` | `kubectl get nodes` |
| **RDS PostgreSQL** | Order data persistence | AWS RDS, private subnet | `cloudops-dev` instance | CloudWatch → RDS → DatabaseConnections |
| **ALB** | TLS termination, host-based routing for all services | AWS ALB, public-facing | `alb_dns_name` in tfvars | AWS Console → EC2 → Load Balancers |
| **Grafana** | Dashboards, alerting, SLO panels | EKS `monitoring` namespace | `https://grafana.example.com` | `curl -s https://grafana.example.com/api/health` |
| **Prometheus** | Metrics storage, scrapes order-api `/metrics` | EKS `monitoring` namespace | `http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090` | Grafana → Explore → `up{job="order-api"}` |
| **Loki** | Log storage backend (S3 chunks) | EKS `loki` namespace | `http://loki-gateway.loki.svc` | Grafana → Explore → Loki → `{namespace="cloudops"}` |
| **Tempo** | Distributed trace storage (S3 backend) | EKS `tempo` namespace | `http://tempo.tempo.svc:4318` | Grafana → Explore → Tempo → search |
| **OTel Collector** | Telemetry gateway: routes traces→Tempo, metrics→Prometheus, logs→Loki | EKS `monitoring` namespace | `https://otel.example.com` (ext), port 4317/4318 (int) | `kubectl get pods -n monitoring -l app.kubernetes.io/name=opentelemetry-collector` |
| **Falco** | eBPF runtime threat detection DaemonSet | EKS `falco` namespace | Findings → OTel → Loki | `kubectl get pods -n falco` |
| **OPA Gatekeeper** | Admission webhook — blocks non-compliant pods | EKS `gatekeeper-system` namespace | ValidatingAdmissionWebhook | `kubectl get constrainttemplate` |
| **kube-bench** | CIS Kubernetes Benchmark CronJob (daily 03:00 UTC) | EKS `cloudops` namespace | CronJob `kube-bench` | `kubectl get cronjob kube-bench -n cloudops` |
| **SLO tracker Lambda** | Queries Prometheus every 5 min, tracks error budgets | AWS Lambda, us-east-1 | `cloudops-error-budget-tracker` | CloudWatch → Log Groups → `/aws/lambda/cloudops-error-budget-tracker` |
| **Compliance scanner Lambda** | Scans S3/RDS/EKS/IAM/SGs every 6h, writes to DynamoDB | AWS Lambda, us-east-1 | `cloudops-compliance-scanner` | CloudWatch → `/aws/lambda/cloudops-compliance-scanner` |
| **Auto-remediation Lambda** | Fixes safe security findings; creates GitHub issues for unsafe ones | AWS Lambda, us-east-1 | `cloudops-auto-remediation` | CloudWatch → `/aws/lambda/cloudops-auto-remediation` |
| **Self-healing controller Lambda** | Responds to CloudWatch Alarms: rollback, scale-out, node replacement | AWS Lambda, us-east-1 | `cloudops-self-healing-controller` | CloudWatch → `/aws/lambda/cloudops-self-healing-controller` |
| **Scale-in scheduler Lambda** | Resets HPA minReplicas 30 min after scale-out events | AWS Lambda, us-east-1 | `cloudops-scale-in-scheduler` | CloudWatch → `/aws/lambda/cloudops-scale-in-scheduler` |
| **Cost ingestion Lambda** | Pulls Cost Explorer data daily → CloudWatch + DynamoDB | AWS Lambda, us-east-1 | `cloudops-cost-ingestion` | CloudWatch → `/aws/lambda/cloudops-cost-ingestion` |
| **Idle detector Lambda** | Checks EKS node CPU + RDS connections daily | AWS Lambda, us-east-1 | `cloudops-idle-detector` | CloudWatch → `/aws/lambda/cloudops-idle-detector` |
| **DynamoDB error-budgets** | SLO error budget history | AWS DynamoDB, us-east-1 | `cloudops-error-budgets` | `aws dynamodb describe-table --table-name cloudops-error-budgets` |
| **DynamoDB security-findings** | Compliance scanner findings store | AWS DynamoDB, us-east-1 | `cloudops-security-findings` | `aws dynamodb describe-table --table-name cloudops-security-findings` |
| **SNS healing-triggers** | CloudWatch Alarms → self-healing Lambda | AWS SNS, us-east-1 | `cloudops-healing-triggers` | CloudWatch → Alarms → check `alarm_actions` |
| **SNS security-alerts** | Compliance findings → auto-remediation Lambda + email | AWS SNS, us-east-1 | `cloudops-security-alerts` | `aws sns list-subscriptions-by-topic` |
| **S3 state bucket** | Terraform remote state | AWS S3, us-east-1 | `cloudops-tfstate-bucket-<suffix>` | `aws s3 ls s3://<bucket>/` |
| **S3 Loki chunks** | Loki log chunk storage | AWS S3, us-east-1 | `cloudops-loki-chunks-<account_id>` | `aws s3 ls s3://cloudops-loki-chunks-<account>/ --summarize` |
| **S3 Tempo traces** | Tempo trace storage | AWS S3, us-east-1 | `cloudops-tempo-traces-<account_id>` | `aws s3 ls s3://cloudops-tempo-traces-<account>/ --summarize` |

---

## 3. Access Guide

### 3.1 kubectl access

```bash
# Configure kubeconfig for the dev cluster
aws eks update-kubeconfig \
  --name cloudops-dev-cluster \
  --region us-east-1

# Verify
kubectl get nodes
kubectl get pods -n cloudops
kubectl get pods -n monitoring
```

> If you get a permissions error, ensure your AWS identity has `eks:DescribeCluster` and is mapped in the EKS `aws-auth` ConfigMap. Check with: `kubectl describe configmap aws-auth -n kube-system`

### 3.2 Grafana access

**URL:** `https://grafana.example.com`

```bash
# Get the admin password from Terraform outputs
terraform output -raw grafana_admin_password
```

Username: `admin`

If Terraform is not available locally, retrieve from the Kubernetes secret:
```bash
kubectl get secret grafana -n monitoring -o jsonpath='{.data.admin-password}' | base64 --decode
```

**Key dashboards:**
| Dashboard | UID | URL path |
|-----------|-----|----------|
| SLO Dashboard | `slo-dashboard` | `/d/slo-dashboard` |
| Security Posture | `security-posture` | `/d/security-posture` |
| Self-Healing | `self-healing-dashboard` | `/d/self-healing-dashboard` |
| FinOps | `finops-dashboard` | `/d/finops-dashboard` |

### 3.3 OTel API key

```bash
# Bearer token for OTLP ingestion
terraform output -raw otel_api_key

# Or from the Kubernetes secret directly
kubectl get secret otel-auth -n monitoring -o jsonpath='{.data.api-key}' | base64 --decode
```

When `publish_otel_ssm_config=true`, SDK clients can discover the same
configuration from SSM Parameter Store:

```bash
# Base endpoint for OTLP/gRPC clients, and for SDKs that append signal paths.
aws ssm get-parameter \
  --name /cloudops/<env>/otel/endpoint \
  --query Parameter.Value \
  --output text

# OTLP/HTTP signal-specific endpoints.
aws ssm get-parameters \
  --names \
    /cloudops/<env>/otel/endpoint/metrics \
    /cloudops/<env>/otel/endpoint/traces \
    /cloudops/<env>/otel/endpoint/logs \
  --query 'Parameters[].{Name:Name,Value:Value}' \
  --output table

# Bearer token for Authorization: Bearer <value>.
aws ssm get-parameter \
  --name /cloudops/<env>/otel/api-key \
  --with-decryption \
  --query Parameter.Value \
  --output text
```

Producer roles need `ssm:GetParameter` / `ssm:GetParameters` on the OTel
parameter path, plus `kms:Decrypt` when the SecureString uses a CMK.

### 3.4 RDS database access

The RDS instance is in a private subnet. To connect:

**Step 1 — Get credentials from Secrets Manager:**
```bash
# Get the secret ARN
terraform output -raw database_secret_arn

# Retrieve credentials
aws secretsmanager get-secret-value \
  --secret-id <secret-arn> \
  --query SecretString \
  --output text | jq .
# Returns: { "username": "...", "password": "...", "host": "...", "port": 5432 }
```

**Step 2 — Connect via a debug pod inside the cluster:**
```bash
# Start a temporary debug pod with psql
kubectl run psql-debug \
  --image=postgres:15 \
  --rm -it \
  --restart=Never \
  -n cloudops \
  -- psql postgresql://<username>:<password>@<host>:5432/cloudops
```

Alternatively, port-forward through an existing pod:
```bash
# Start a debug container with port-forward access to RDS host
kubectl run port-fwd \
  --image=alpine/socat \
  --rm -it \
  --restart=Never \
  -n cloudops \
  -- socat TCP-LISTEN:5432,fork TCP:<rds-host>:5432 &

kubectl port-forward pod/port-fwd 5432:5432 -n cloudops
# Then connect locally: psql -h localhost -U <username> -d cloudops
```

### 3.5 Lambda log access

```bash
# Tail the most recent log stream for any Lambda
aws logs tail /aws/lambda/cloudops-error-budget-tracker --follow
aws logs tail /aws/lambda/cloudops-compliance-scanner --follow
aws logs tail /aws/lambda/cloudops-auto-remediation --follow
aws logs tail /aws/lambda/cloudops-self-healing-controller --follow
aws logs tail /aws/lambda/cloudops-scale-in-scheduler --follow
aws logs tail /aws/lambda/cloudops-cost-ingestion --follow
aws logs tail /aws/lambda/cloudops-idle-detector --follow

# Filter for errors only
aws logs filter-log-events \
  --log-group-name /aws/lambda/cloudops-self-healing-controller \
  --filter-pattern '"level":"error"'
```

In Grafana, all Lambda logs are also queryable via Loki:
```
{namespace="monitoring", service_name="cloudops-self-healing-controller"}
```

---

## 4. Common Operational Tasks

### 4.1 Deploy a new version of order-api (CI/CD path — preferred)

1. Merge a PR to `main` that modifies `apps/order-api/**`
2. The App Pipeline (`.github/workflows/app.yml`) automatically:
   - Runs unit tests + `npm audit`
   - Validates Kubernetes manifests with kubeval + kubeconform
   - Builds and pushes a Docker image to ECR tagged with the commit SHA
   - Signs the image with Cosign (keyless OIDC flow)
   - Checks the error budget gate: if availability budget < 10% or latency budget < 10%, the deploy is blocked unless `override_budget_check=true` is set on `workflow_dispatch`
   - Runs smoke tests against the new pod before finalizing
   - Rolls back automatically if smoke tests fail
3. Monitor the rollout: `kubectl rollout status deployment/order-api -n cloudops`

### 4.2 Deploy a new version of order-api (manual)

Use only for emergencies (e.g., hotfix while CI is broken):

```bash
# Build and push the image
docker build -t order-api:hotfix apps/order-api/
docker tag order-api:hotfix <ecr-url>/order-api:<git-sha>
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ecr-url>
docker push <ecr-url>/order-api:<git-sha>

# Update the deployment image
kubectl set image deployment/order-api \
  order-api=<ecr-url>/order-api:<git-sha> \
  -n cloudops

# Watch the rollout
kubectl rollout status deployment/order-api -n cloudops --timeout=5m

# Verify pods are healthy
kubectl get pods -n cloudops -l app=order-api
```

> Set `CHANGE_CAUSE` for audit trail: `kubectl annotate deployment order-api kubernetes.io/change-cause="hotfix: <reason>" -n cloudops`

### 4.3 Roll back order-api

```bash
# Roll back to the previous revision
kubectl rollout undo deployment/order-api -n cloudops

# Monitor rollback
kubectl rollout status deployment/order-api -n cloudops

# Confirm pods are running with the previous image
kubectl get pods -n cloudops -l app=order-api -o jsonpath='{.items[*].spec.containers[*].image}'

# Tail logs to confirm errors have stopped
kubectl logs -f -l app=order-api -n cloudops --tail=50
```

To roll back to a specific revision:
```bash
kubectl rollout history deployment/order-api -n cloudops
kubectl rollout undo deployment/order-api --to-revision=<N> -n cloudops
```

### 4.4 Scale order-api manually

```bash
# Scale to N replicas immediately
kubectl scale deployment order-api --replicas=4 -n cloudops

# Verify
kubectl get pods -n cloudops -l app=order-api

# Update HPA minimum if you want the self-healing controller to preserve the higher count
kubectl patch hpa order-api -n cloudops \
  --patch '{"spec":{"minReplicas":4}}'
```

> The scale-in scheduler Lambda will reset HPA `minReplicas` back to 2 (BASELINE_MIN_PODS) 30 minutes after any self-healing scale-out event. If you scale manually and want to preserve the change, update the HPA spec directly or adjust `self_healing_min_healthy_pods` in `terraform.tfvars` and re-apply.

### 4.5 Check SLO status

**Via Grafana:** `https://grafana.example.com/d/slo-dashboard`

Key panels:
- Availability SLI (top-left stat) — should be ≥ 99.9%
- Latency SLI (top-right stat) — should be ≥ 95%
- Error budget remaining — watch for < 50%
- Burn rate (1h) — anything > 1.0x means the budget is shrinking

**Via CloudWatch:**
```bash
# Get availability SLI from last 15 minutes
aws cloudwatch get-metric-statistics \
  --namespace CloudOps/SLO \
  --metric-name AvailabilitySLI \
  --dimensions Name=Service,Value=order-api Name=Environment,Value=dev \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 900 \
  --statistics Average \
  --query 'sort_by(Datapoints, &Timestamp)[-1].Average' \
  --output text

# Get burn rate
aws cloudwatch get-metric-statistics \
  --namespace CloudOps/SLO \
  --metric-name BurnRate1h \
  --dimensions Name=Service,Value=order-api Name=Environment,Value=dev \
  --start-time $(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 900 \
  --statistics Average \
  --output text
```

### 4.6 Check error budget

**Via Prometheus (in Grafana Explore):**
```promql
# Availability budget remaining (1.0 = full, 0.0 = exhausted)
job:slo_error_budget:availability_remaining{service="order-api"}

# Latency budget remaining
job:slo_error_budget:latency_remaining{service="order-api"}

# Minutes of downtime remaining in the 30-day window
(job:slo_error_budget:availability_remaining{service="order-api"} * 43.2)
```

**Via DynamoDB** (historical trend):
```bash
aws dynamodb query \
  --table-name cloudops-error-budgets \
  --key-condition-expression "service = :svc" \
  --expression-attribute-values '{":svc":{"S":"order-api"}}' \
  --scan-index-forward false \
  --limit 5 \
  --output json | jq '.Items[] | {ts: .timestamp.S, budgetRemaining: .budgetRemaining.N, burnRate: .burnRate1h.N}'
```

### 4.7 Check security findings

**Via Grafana:** `https://grafana.example.com/d/security-posture`

**Via DynamoDB:**
```bash
# All OPEN CRITICAL findings
aws dynamodb query \
  --table-name cloudops-security-findings \
  --index-name severity-timestamp-index \
  --key-condition-expression "severity = :s" \
  --filter-expression "#st = :open" \
  --expression-attribute-names '{"#st":"status"}' \
  --expression-attribute-values '{":s":{"S":"CRITICAL"},":open":{"S":"OPEN"}}' \
  --output json | jq '.Items[] | {check: .checkName.S, resource: .resource_id.S, ts: .timestamp.S}'

# All open findings (any severity)
aws dynamodb scan \
  --table-name cloudops-security-findings \
  --filter-expression "#st = :open" \
  --expression-attribute-names '{"#st":"status"}' \
  --expression-attribute-values '{":open":{"S":"OPEN"}}' \
  --output json | jq '.Items | group_by(.severity.S) | map({severity: .[0].severity.S, count: length})'
```

**Via Loki** (Falco runtime findings):
```
Grafana → Explore → Loki
{service_name="falco"} | json | priority="CRITICAL"
```

### 4.8 Check cost status

**Via Grafana:** `https://grafana.example.com/d/finops-dashboard`

**Via CloudWatch:**
```bash
# Daily cost totals (last 7 days)
aws cloudwatch get-metric-statistics \
  --namespace CloudOps/FinOps \
  --metric-name DailyCostUSD \
  --dimensions Name=Account,Value=<account_id> \
  --start-time $(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
  --period 86400 \
  --statistics Maximum \
  --output table

# Check budget utilization
aws budgets describe-budgets \
  --account-id <account_id> \
  --query 'Budgets[*].{Name:BudgetName, Limit:BudgetLimit.Amount, Actual:CalculatedSpend.ActualSpend.Amount, Forecasted:CalculatedSpend.ForecastedSpend.Amount}'
```

### 4.9 Force compliance scan

```bash
aws lambda invoke \
  --function-name cloudops-compliance-scanner \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail \
  /tmp/compliance-out.json \
  | jq -r '.LogResult' | base64 --decode

cat /tmp/compliance-out.json | jq .
```

### 4.10 Force error budget recalculation

```bash
aws lambda invoke \
  --function-name cloudops-error-budget-tracker \
  --cli-binary-format raw-in-base64-out \
  --log-type Tail \
  /tmp/slo-out.json \
  | jq -r '.LogResult' | base64 --decode

cat /tmp/slo-out.json | jq .
```

### 4.x Investigate `audit_events` for a tenant or order

Backlog #73 wires the order-api audit trail. Every successful and failed
`POST /order` writes a tenant-scoped row.

```bash
# Connect via the bastion / runner-in-VPC path (see docs/private-eks-access.md).
psql "$ORDER_API_DB_URL" <<'SQL'
-- Recent activity for tenant `acme`.
SELECT created_at, action, result, status_code, resource_id, error_code, metadata
FROM audit_events
WHERE tenant_id = 'acme'
ORDER BY created_at DESC
LIMIT 100;

-- Trace a specific order across success + failure events.
SELECT *
FROM audit_events
WHERE resource_id = 'ORD-...'
ORDER BY created_at;
SQL
```

RLS is FORCED on `audit_events`, so the session must run `SET app.tenant_id`
first if the role used is not the owner. Use the app's connection pool
helper or the `withTenant` wrapper when accessing from code.

---

## 5. Alert Response Matrix

### 5.1 Self-Healing Controller Alarms (CloudWatch → SNS → Lambda)

| Alarm Name | Severity | Condition | Auto-Healing | Auto Action | First Manual Action | Runbook |
|-----------|---------|-----------|:---:|------------|-------------------|---------|
| `cloudops-dev-order-api-high-error-rate` | P1 | ALB 5xx count > 10 in 5 min | Yes | Rollout restart of `order-api` deployment; scale-out if not recovering in 30s | Confirm rollback in progress: `kubectl rollout status deployment/order-api -n cloudops` | [slo-fast-burn.md](slo-fast-burn.md) |
| `cloudops-dev-order-api-high-latency` | P2 | ALB p99 latency > 2s for 3 consecutive minutes | Yes | Scale-out: HPA `minReplicas` + 2 (up to MAX_SCALE_OUT_PODS) | Check HPA: `kubectl get hpa order-api -n cloudops`; check DB connection saturation | — |
| `cloudops-dev-order-api-pod-count-low` | P1 | Running pods < 2 for 2 min (breaching on missing data) | Yes | Check HPA; if HPA not working, directly patch deployment replicas; if nodes are low, trigger ASG scale-out | `kubectl get pods -n cloudops`; `kubectl describe hpa order-api -n cloudops` | — |
| `cloudops-dev-rds-high-connections` | P2 | DB connections > 80 for 2 min | No (alert only) | SNS notification with current instance class | Check connection pool config in order-api; consider restarting order-api pods to recycle connections | — |
| `cloudops-dev-rds-high-cpu` | P2 | RDS CPU > 80% for 2 min | No (recommend read replica) | GitHub issue opened if no replica exists | Check RDS Performance Insights for slow queries; consider `database_create_read_replica = true` | — |
| `cloudops-dev-rds-low-storage` | P1 | Free storage < 2 GB | No (SNS alert with forecast) | SNS with days-until-full projection | Increase `database_max_allocated_storage` in tfvars and re-apply (RDS autoscaling will expand) | — |
| `cloudops-dev-eks-node-not-ready` | P1 | NodeNotReady metric > 0 | Yes | Cordon NotReady node, evict pods from `cloudops` namespace, trigger ASG instance refresh | `kubectl get nodes`; check replacement: `aws autoscaling describe-instance-refreshes --auto-scaling-group-name <asg>` | — |

### 5.2 SLO Prometheus Alerts

| Alert Name | Severity | Condition | Auto-Healing | First Manual Action | Runbook |
|-----------|---------|-----------|:---:|-------------------|---------|
| `SLOAvailabilityFastBurn` | critical (P1) | Availability burn rate > 14.4× in both 1h + 5m windows | No | Check recent deployments; `kubectl rollout history deployment/order-api -n cloudops`; consider rollback | [slo-fast-burn.md](slo-fast-burn.md) |
| `SLOAvailabilitySlowBurn` | warning (P2) | Availability burn rate > 6× in both 6h + 30m windows | No | Open investigation ticket; review error rate trend in Grafana over last 6h | [slo-slow-burn.md](slo-slow-burn.md) |
| `SLOAvailabilityBudgetCritical` | critical (P1) | Availability error budget < 10% remaining | No | Deployment freeze: no new features until budget recovers; declare incident if < 5% | [error-budget-exhausted.md](error-budget-exhausted.md) |
| `SLOAvailabilityBudgetLow` | warning (P2) | Availability error budget < 50% remaining | No | Review recent error rate; check if any deployments are scheduled; consider slowing release cadence | [error-budget-exhausted.md](error-budget-exhausted.md) |
| `SLOLatencyFastBurn` | critical (P1) | Latency burn rate > 14.4× in both 1h + 5m windows | No | Check RDS query latency in Performance Insights; check pod CPU/memory headroom; scale if needed | [slo-fast-burn.md](slo-fast-burn.md) |
| `SLOLatencySlowBurn` | warning (P2) | Latency burn rate > 6× in both 6h + 30m windows | No | Profile p99 in Grafana Tempo; look for slow DB queries; check if a new route was recently deployed | [slo-slow-burn.md](slo-slow-burn.md) |
| `SLOLatencyBudgetCritical` | critical (P1) | Latency error budget < 10% remaining | No | Investigate slow endpoints via Tempo traces; check for missing DB indexes | [error-budget-exhausted.md](error-budget-exhausted.md) |
| `SLOLatencyBudgetLow` | warning (P2) | Latency error budget < 50% remaining | No | Review p99 trend; confirm no recent schema changes that could be slowing queries | [error-budget-exhausted.md](error-budget-exhausted.md) |

### 5.3 Security Alerts

| Alert Source | Severity | Condition | Auto-Healing | First Manual Action | Runbook |
|-------------|---------|-----------|:---:|-------------------|---------|
| Compliance scanner — CRITICAL finding | critical (P1) | Any CRITICAL finding in DynamoDB with status=OPEN | Yes (for safe findings: S3 public access, open SGs) | `aws dynamodb query --table-name cloudops-security-findings ...` (see §4.7) | [compliance-critical-finding.md](security/compliance-critical-finding.md) |
| Falco — `CRITICAL` runtime alert | critical (P1) | Shell in container, privilege escalation, unexpected `execve` | Yes (pod quarantine — label removed from Service) | `kubectl get pods -n cloudops --show-labels`; check Loki: `{service_name="falco"} \| json \| priority="CRITICAL"` | [falco-critical-alert.md](security/falco-critical-alert.md) |
| Auto-remediation Lambda failure | warning (P2) | Lambda error in CloudWatch | No | Check logs: `aws logs tail /aws/lambda/cloudops-auto-remediation`; retry: `aws lambda invoke --function-name cloudops-auto-remediation` | [auto-remediation-failure.md](security/auto-remediation-failure.md) |
| CI compliance-scan job failure | P1 | New CRITICAL findings after `terraform apply` | No | Review GitHub Actions job output; remediate finding; re-run pipeline | [compliance-critical-finding.md](security/compliance-critical-finding.md) |

### 5.4 FinOps Alerts

| Alert | Severity | Condition | Auto-Healing | First Manual Action |
|-------|---------|-----------|:---:|-------------------|
| AWS Budgets — 80% threshold ($40) | warning (P2) | Monthly spend ≥ $40 | No | Review FinOps Grafana dashboard; check idle resources; identify cost anomalies |
| AWS Budgets — 100% threshold ($50) | critical (P1) | Monthly spend ≥ $50 | No | Freeze non-essential resource creation; review cost anomaly alerts; disable non-critical modules (finops, slo toggles) |
| Cost anomaly per service | warning | Service cost > 20% above 7-day average | No | Check which service spiked: `aws ce get-cost-and-usage`; check for data transfer or unexpected API call spikes |
| Idle EKS nodes | info | Node CPU < 10% for 24h | No | Verify application is receiving traffic; check ALB target health |

---

## 6. Deployment Checklist

Run this checklist before **any** change to `main` that will trigger a `terraform apply` or application deploy in a production-grade environment.

- [ ] **Error budget > 50%** — check `job:slo_error_budget:availability_remaining > 0.5` in Grafana. If < 50%, assess whether this deploy reduces or increases risk. If < 10%, do not deploy features — hotfixes only.
  ```bash
  # Quick check
  aws lambda invoke --function-name cloudops-error-budget-tracker /tmp/eb.json && cat /tmp/eb.json | jq .
  ```

- [ ] **No CRITICAL security findings open**
  ```bash
  aws dynamodb scan --table-name cloudops-security-findings \
    --filter-expression "#st = :open AND severity = :crit" \
    --expression-attribute-names '{"#st":"status"}' \
    --expression-attribute-values '{":open":{"S":"OPEN"},":crit":{"S":"CRITICAL"}}' \
    --output json | jq '.Count'
  # Must be 0
  ```

- [ ] **All order-api pods healthy**
  ```bash
  kubectl get pods -n cloudops -l app=order-api
  # All pods: Running, READY 1/1
  kubectl get deployment order-api -n cloudops
  # READY should match DESIRED
  ```

- [ ] **RDS connections < 50** (headroom before the 80-connection alarm)
  ```bash
  aws cloudwatch get-metric-statistics \
    --namespace AWS/RDS \
    --metric-name DatabaseConnections \
    --dimensions Name=DBInstanceIdentifier,Value=cloudops-dev \
    --start-time $(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ) \
    --end-time $(date -u +%Y-%m-%dT%H:%M:%SZ) \
    --period 300 --statistics Average --output text
  ```

- [ ] **CI/CD pipeline green on main branch** — check https://github.com/your-org/your-repo/actions. The `quality`, `security-scan`, and `manifest-validation` jobs must all be passing. The `plan` job must have run successfully within the last 24 hours.

- [ ] **Infracost delta < $10/month** — review the Infracost comment on the PR. Any delta above $10/month requires explicit justification in the PR description.

- [ ] **Smoke test passing** — after deploy, confirm:
  ```bash
  curl -sf https://api.example.com/health | jq .status
  # Expected: "ok"
  curl -sf -X POST https://api.example.com/order \
    -H 'Content-Type: application/json' \
    -d '{"items":["smoke-test"],"total":0.01}' | jq .success
  # Expected: true
  ```

- [ ] **Self-healing dry run status** — confirm `self_healing_dry_run` value is intentional:
  ```bash
  grep self_healing_dry_run terraform.tfvars
  # In production this should be 'false' — verify deliberately
  ```

---

## 7. Incident Response

### 7.1 Severity Levels

| Level | Definition | Response Time | Examples |
|-------|-----------|---------------|---------|
| **P1** | Service down or SLO breach imminent (< 2h of error budget remaining). Customer-facing impact. | Immediate — wake anyone up | order-api returning 100% 5xx; RDS unavailable; all pods crashlooping; SLOAvailabilityFastBurn firing |
| **P2** | Degraded performance but service is up. SLO burn rate > 6×. Security finding that needs same-day remediation. | < 30 minutes during business hours; < 2 hours otherwise | p99 latency > 2s; error rate 0.5-5%; RDS CPU > 80%; CRITICAL compliance finding |
| **P3** | Non-customer-impacting issue that could escalate. Error budget < 50%. | < 4 hours business hours | SLOAvailabilityBudgetLow; idle resources; slow burn SLO alert; medium-severity security finding |
| **P4** | Informational, no immediate action required. | Next business day | Cost anomaly; LOW security finding; kube-bench warning; capacity planning concern |

### 7.2 First 5 Minutes Checklist

On any P1/P2 alert, run through this in order before anything else:

1. **Is the API responding?**
   ```bash
   curl -sf https://api.example.com/health && echo "UP" || echo "DOWN"
   ```

2. **Are pods running?**
   ```bash
   kubectl get pods -n cloudops
   ```

3. **What is the current error rate?**
   Open Grafana SLO dashboard or run:
   ```promql
   1 - job:slo_availability:ratio_rate5m{service="order-api"}
   ```

4. **Did anything deploy recently?**
   ```bash
   kubectl rollout history deployment/order-api -n cloudops
   # Check GitHub Actions: https://github.com/your-org/your-repo/actions
   ```

5. **Is RDS healthy?**
   ```bash
   aws rds describe-db-instances \
     --db-instance-identifier cloudops-dev \
     --query 'DBInstances[0].{Status:DBInstanceStatus,Connections:Endpoint.Address}'
   ```

6. **Is the self-healing controller already handling it?**
   ```bash
   aws logs tail /aws/lambda/cloudops-self-healing-controller --since 5m | grep -E '"action"|"result"'
   ```

### 7.3 How to Declare an Incident

For P1 and P2:

1. Open a GitHub Issue in the `your-org/your-repo` repo titled: `[INCIDENT-<date>] <brief description>`
2. Add label `incident` + severity label (`P1` or `P2`)
3. Post the incident communication (see §7.4 template)
4. Update the issue with timeline entries as the incident progresses
5. Close the issue when resolved and link to the post-incident review

### 7.4 Incident Communication Template

```
INCIDENT NOTIFICATION — <date/time UTC>

Status: INVESTIGATING | IDENTIFIED | MONITORING | RESOLVED
Severity: P1 | P2
Impact: <one sentence — who is affected and how>
Started: <timestamp UTC>
Resolved: <timestamp or "ongoing">

Summary:
<2-3 sentences describing what happened and what is being done>

Next update: <time>
Point of contact: <name>
```

### 7.5 Post-Incident Review Template

Create a new file at `docs/postmortems/YYYY-MM-DD-<slug>.md`:

```markdown
# Post-Incident Review: <title>
**Date:** YYYY-MM-DD
**Author:** <name>
**Severity:** P1/P2
**Duration:** <start> – <end> UTC (<total minutes>)

## Summary
One paragraph. What happened, what broke, how it was fixed.

## Timeline
| Time (UTC) | Event |
|-----------|-------|
| HH:MM | Alert fired: <alert name> |
| HH:MM | On-call began investigation |
| HH:MM | Root cause identified: <description> |
| HH:MM | Mitigation applied: <action> |
| HH:MM | Service fully recovered |

## Root Cause
<Technical explanation>

## Impact
- Error budget consumed: <X>% of availability / <Y>% of latency
- Estimated affected requests: <N>
- Duration of user impact: <minutes>

## What Went Well
- <item>

## What Could Be Improved
- <item>

## Action Items
| Action | Owner | Due |
|--------|-------|-----|
| <fix> | <name> | <date> |

## Error Budget Adjustment
Remaining availability budget after incident: <X>%
Remaining latency budget after incident: <Y>%
Budget freeze required: YES / NO
```

---

## 8. Disaster Recovery

> **Note:** This section covers current recovery procedures. A formal DR strategy with cross-region replication is pending (Stage 11 — Disaster Recovery module).

### 8.1 RPO/RTO by Component

| Component | RPO (data loss) | RTO (recovery time) | Notes |
|-----------|----------------|--------------------|----|
| order-api | N/A (stateless) | ~3 min (pod restart / rollback) | `kubectl rollout undo` or new deploy |
| EKS cluster | N/A (no state on nodes) | ~15 min (terraform apply -target=module.eks) | Node configs are in Terraform; no data on nodes |
| RDS PostgreSQL | ~24h (daily automated snapshot) | ~30-60 min (point-in-time restore) | `database_backup_retention_period = 7` days in tfvars; PITR available within that window |
| S3 Loki chunks | ~0 (S3 11-nines durability) | Immediate | No RPO concern; S3 is the storage layer |
| S3 Tempo traces | ~0 (S3 11-nines durability) | Immediate | No RPO concern |
| Terraform state | ~0 (S3 with versioning) | Minutes (retrieve previous state version) | `aws s3 ls s3://<state-bucket>/?versions` |
| DynamoDB (error-budgets, security-findings) | ~0 (DynamoDB durable) | Immediate | Point-in-time recovery enabled by AWS default |

### 8.2 RDS Restore from Backup

**Point-in-time restore** (recover to any second within the retention window):
```bash
# Find available restore time
aws rds describe-db-instances \
  --db-instance-identifier cloudops-dev \
  --query 'DBInstances[0].{EarliestRestoreTime:RestoreWindow.EarliestTime, LatestRestoreTime:RestoreWindow.LatestTime}'

# Restore to a new instance (never overwrites the original)
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier cloudops-dev \
  --target-db-instance-identifier cloudops-dev-restored \
  --restore-time 2026-03-27T10:00:00Z \
  --db-instance-class db.t3.micro \
  --no-publicly-accessible

# Wait for restore (~30-60 min)
aws rds wait db-instance-available \
  --db-instance-identifier cloudops-dev-restored

# Get the new endpoint
aws rds describe-db-instances \
  --db-instance-identifier cloudops-dev-restored \
  --query 'DBInstances[0].Endpoint.Address' --output text
```

After restore: update the DB_HOST environment variable in the order-api Kubernetes Deployment to point to the restored instance, or update `terraform.tfvars` and re-apply.

**Restore from manual snapshot:**
```bash
# List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier cloudops-dev \
  --query 'DBSnapshots[*].{Id:DBSnapshotIdentifier, Time:SnapshotCreateTime, Status:Status}'

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier cloudops-dev-restored \
  --db-snapshot-identifier <snapshot-id>
```

### 8.3 Full Environment Rebuild

In a complete infrastructure loss scenario (accidental `destroy_all=true` or account compromise), rebuild using `scripts/deploy.sh`:

```bash
# 1. Ensure terraform.tfvars is present (check git history or CI secrets)
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with correct values

# 2. Run the deployment script
./scripts/deploy.sh
```

**Estimated rebuild time by stage:**

| Stage | Component | Estimated Time |
|-------|-----------|---------------|
| 1 | S3 state bucket creation | < 1 min |
| 2 | Terraform init | < 1 min |
| 3 | Bootstrap + Networking | ~2 min |
| 4 | EKS cluster | ~15 min |
| 5 | Ingress (ACM + LBC) | ~3 min |
| 6 | Observability (LGTM stack Helm releases) | ~10 min |
| 7 | Security (Falco DaemonSet + Lambda) | ~5 min |
| 8 | Database (RDS) | ~8 min |
| 9 | Final sync + SLO/FinOps | ~3 min |
| **Total** | | **~50 min** |

> After `scripts/deploy.sh`, set `alb_dns_name` and `alb_zone_id` from the provisioned ALB, then re-run `terraform apply` for Route 53 records. Application images will need to be redeployed from ECR.

### 8.4 Data Recovery Priority Order

In a partial failure, recover in this order to minimize impact:

1. **EKS + order-api pods** — restores API availability (stateless, fast)
2. **RDS** — restores order persistence (if data is needed; API can serve health/metrics without it)
3. **ALB/Ingress** — restores external routing (internal operations work without it)
4. **Observability** — restores visibility (degraded operations possible without it)
5. **Security module** — restores threat detection (runtime risk while down; highest priority after core services)
6. **SLO/FinOps/Self-healing** — restores automated monitoring (manual oversight substitutes temporarily)

---

## 9. Contacts and Escalation

| Role | Name | Contact | Escalation Condition |
|------|------|---------|---------------------|
| Primary On-Call | Tamen Dutta | _[fill in]_ | All P1/P2 alerts |
| Secondary On-Call | _[fill in]_ | _[fill in]_ | Primary unreachable for > 15 min |
| Engineering Manager | _[fill in]_ | _[fill in]_ | P1 not resolved within 30 min; customer communication needed |
| AWS Support | — | AWS Console → Support → Create Case | AWS infrastructure issues (EKS API unavailable, S3 endpoint issues, RDS service degradation) |
| GitHub Actions | — | https://www.githubstatus.com | CI/CD pipeline failures that look platform-level |

**External dependency contacts:**

| Dependency | Status page | Notes |
|-----------|------------|-------|
| AWS us-east-1 | https://health.aws.amazon.com | Check before escalating AWS issues to support |
| Grafana Cloud | https://status.grafana.com | Not currently used (self-hosted), but relevant if migrating |
| GitHub | https://www.githubstatus.com | CI/CD dependency |

---

## 9.5 Storefront

Storefront stories (#79-#89) extend the platform with: Next.js 15 RSC
app at the apex domain, Cognito User Pool + Hosted UI at `auth.<domain>`,
search Lambda + API GW HTTP at `search.<domain>`, WebSocket fanout at
`ws.<domain>`, DynamoDB cart, Kinesis order events, Step Functions
checkout saga, and the polyglot service mesh + load generator surfaced
through the operator console.

### 9.5.1 Cognito user signup

Test user provisioning + `custom:tenant_id`:

```bash
POOL_ID=$(terraform -chdir=stacks/platform output -raw cognito_user_pool_id)
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username demo@example.com \
  --user-attributes Name=email,Value=demo@example.com \
                    Name=email_verified,Value=true \
                    Name=custom:tenant_id,Value=acme \
  --temporary-password 'TempPass!2026'

# Promote to admin (gates /admin/* in the storefront):
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$POOL_ID" --username demo@example.com --group-name admin
```

### 9.5.2 Storefront secrets rotation

| Secret | Source | Rotation cadence |
|---|---|---|
| `INTERNAL_HMAC_SECRET` | Secrets Manager → External Secrets | 90 days (manual) |
| `WS_TOKEN_SECRET` | Secrets Manager → External Secrets | 30 days |
| OTel bearer token | SSM Parameter Store | tied to keepers (#38) |
| Cognito client (no secret — PKCE) | n/a | n/a |

### 9.5.3 WebSocket troubleshooting

- **Storefront flips to `reconnecting`** — check `/api/ws-token` response
  body; if it's `503 ws_token_disabled` the deployment is missing
  `WS_TOKEN_SECRET`.
- **`$connect` returns 401** — the short-lived WS ticket failed
  verification. Confirm the storefront `WS_TOKEN_SECRET` and the
  `storefront_realtime_ws_token_secret_arn` value point at the same
  Secrets Manager material. Cognito issuer + audience remain as a rollout
  fallback for older clients.
- **Updates stop arriving but `$connect` still works** — fanout Lambda
  hit the DLQ. Check `aws lambda get-function-event-invoke-config`.
- **Stale connections** — fanout drops 410 Gone rows automatically.
  Force-prune via `aws dynamodb scan --filter-expression "expires_at <
  :now"` if needed.

### 9.5.4 Checkout saga compensation

- **Find a failed execution:**
  ```bash
  aws stepfunctions list-executions --state-machine-arn "$SM_ARN" --status-filter FAILED
  aws stepfunctions get-execution-history --execution-arn "$EXEC_ARN" --query 'events[*].[type, stateEnteredEventDetails.name]'
  ```
- **Replay a stuck execution:** use the same execution name with a
  fresh `StartExecutionCommand` — the order-api idempotency table
  ensures the order is not duplicated.
- **Manual compensation:** if Step Functions failed past the order
  creation but the customer was charged, `PATCH /order/:id` with
  `status=cancelled` and write a corresponding `audit_events` row.

---

## 10. Glossary

**Availability SLI** — The proportion of HTTP requests to order-api that return a non-5xx response. Expressed as a decimal (0.999 = 99.9%). Measured by Prometheus recording rule `job:slo_availability:ratio_rate5m`.

**Blast radius** — The scope of harm that a failure or a security compromise can cause. Used in two contexts: (1) the blast radius of a misconfigured auto-remediation action (e.g., could it accidentally scale down a production service?); (2) the blast radius of a compromised AWS credential (with IRSA, a compromised pod's credentials are scoped only to that pod's IAM role).

**Burn rate** — How fast the error budget is being consumed relative to the allowed rate. A burn rate of 1.0 means you're consuming budget at exactly the pace that would exhaust it by end of month. A burn rate of 14.4 means you'd exhaust the entire monthly budget in ~2 hours.

**DRY_RUN** — An environment variable on the self-healing and auto-remediation Lambdas. When `true`, all actions are logged but no AWS or Kubernetes API mutations are made. Used to validate alarm routing without risk. Default is `true` in `terraform.tfvars.example` — must be deliberately set to `false` to enable live remediation.

**Error budget** — The amount of unreliability permitted by an SLO. For a 99.9% availability SLO over 30 days, the error budget is 0.1% × 30 days × 24 hours × 60 minutes = ~43.2 minutes of allowable downtime (or equivalent proportional request failures). Once exhausted, the SLO is breached.

**IRSA (IAM Roles for Service Accounts)** — The mechanism that lets EKS pods assume IAM roles without using the EC2 instance profile. Each Kubernetes ServiceAccount is annotated with an IAM role ARN; the EKS OIDC provider mediates short-lived credential issuance via `sts:AssumeRoleWithWebIdentity`. See [ADR 005](../adr/005-irsa-over-node-role.md).

**LGTM stack** — The Grafana observability stack: Loki (logs), Grafana (dashboards + alerting), Tempo (traces), Mimir/Prometheus (metrics). CloudOps uses all four with Prometheus (via kube-prometheus-stack) instead of Mimir.

**MTTD (Mean Time to Detect)** — Average time from when a problem starts to when monitoring detects and alerts on it. Improved by lower Prometheus scrape intervals, multi-window burn rate alerting, and CloudWatch alarm evaluation periods.

**MTTR (Mean Time to Resolve)** — Average time from detection to full service recovery. Improved by runbooks, auto-remediation, and pre-validated rollback procedures.

**OTel (OpenTelemetry)** — An open-source observability framework and collector. CloudOps uses the OTel Collector in gateway mode to receive all telemetry (traces, metrics, logs) from SDK clients and route them to Tempo, Prometheus, and Loki. See [ADR 003](../adr/003-otel-collector-gateway.md).

**SLI (Service Level Indicator)** — A measured metric that represents a dimension of service quality from the user's perspective. CloudOps SLIs: availability (non-5xx request ratio) and latency (requests completing in < 300ms ratio).

**SLO (Service Level Objective)** — A target value for an SLI, expressed as a percentage over a time window. CloudOps SLOs: 99.9% availability over 30 days; 95% latency compliance over 30 days.

**SNS (Simple Notification Service)** — AWS pub/sub messaging. Used in CloudOps for two purposes: (1) CloudWatch Alarms → SNS topic `cloudops-healing-triggers` → Lambda `cloudops-self-healing-controller`; (2) Compliance scanner → SNS topic `cloudops-security-alerts` → Lambda `cloudops-auto-remediation` + email subscribers.
