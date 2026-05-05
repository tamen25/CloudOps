# Prod Readiness Roadmap

Plan for taking this dev/test platform to production-enterprise grade. Assumes
the code is reshaped now and the cost flip happens later via tfvars.

**Strategy**: prod-shaped code, dev-priced runtime. Every prod pattern lands in
the repo behind a flag with a safe default. Dev keeps the cheap floor; prod
unlocks the full set via `environments/prod.tfvars`.

> **Status note (2026-05-05):** this is a roadmap snapshot. The
> *canonical*, day-to-day backlog (with resolution notes per item) lives in
> `CLAUDE.md` at the repo root. Items marked `todo` here that are now
> resolved should be assumed superseded by the CLAUDE.md row of the same
> topic; updated below where the topic maps cleanly. Items still `todo`
> here are work that has not yet been picked up.

## What landed since the original snapshot

Tracked by CLAUDE.md backlog ID; cross-referenced for the topics covered in
this roadmap:

- **A-1** Real auth — `done` (CLAUDE.md #7: JWT verifier via `jose`).
- **A-2** Per-tenant rate limit — `done` (CLAUDE.md #45: two-tier limiter).
- **A-4** Tenancy model — `done` (CLAUDE.md #8 + #51: tenant_id + RLS).
- **D-1** RDS multi-AZ + final snapshot policy — `done` for prod profile (#40).
- **D-3** Secrets rotation — `done` (#11: SAR app auto-deploys).
- **D-5** AWS Backup vault — `done` (#14 / prod-enterprise reshape).
- **E-1** WAFv2 on public ALBs — `done` (prod-enterprise reshape).
- **K-2** EKS control-plane logs to CloudWatch — `done`.
- **K-5** Gatekeeper enforce mode — `done` for the deployed constraint set
  (#56 image-signature constraint default-off until cosign-provider lands).
- **K-7** Default-deny NetworkPolicy — `done` (#26 + #58).
- **N-2** VPC flow logs to S3 — `done` (prod-enterprise reshape).
- **O-1..O-7** Mimir + HA observability — `done` (prod-enterprise reshape).
- **State KMS** — `done` (#53).
- **TLS to RDS** — `done` (#57).
- **App deploy approval + image promotion** — `done` (#54).
- **Drift per env+stack** — `done` (#59).
- **Cosign provider deployment** — `todo` (#56 follow-up).
- **M-1 Cilium service mesh** — `todo` (#9 — open).
- **N-4 Transit Gateway** — `todo` (still single-VPC).
- **K-4 Karpenter** — `todo` (autoscaler stays Cluster Autoscaler for now).

The full per-item state — including what changed and why — is in
`CLAUDE.md` § Known Risks / Follow-ups (backlog).

---

## Cost frame

| Layer                            | Dev now | Prod-enterprise | Delta    |
|----------------------------------|---------|-----------------|----------|
| EKS + nodes (3 AZ on-demand)     | ~$80    | ~$700           | +$620    |
| NAT × 3                          | $0      | ~$100           | +$100    |
| RDS multi-AZ + read replica      | ~$13    | ~$540           | +$527    |
| WAF + Shield Standard            | $0      | ~$50            | +$50     |
| CloudFront                       | $0      | ~$30            | +$30     |
| Mimir compute + S3               | $0      | ~$80            | +$80     |
| Loki / Tempo HA                  | minimal | ~$60            | +$50     |
| GuardDuty + Config + Security Hub| minimal | ~$70            | +$60     |
| AWS Backup                       | $0      | ~$30            | +$30     |
| Shield Advanced (optional)       | $0      | $3,000          | +$3,000  |
| **Total**                        | **~$95**| **~$1,660**     |          |

---

## Domain backlog

Status: `todo` / `in-progress` / `done` / `blocked`. Priority `P1`–`P4`.

### 1. Observability — Mimir + HA

| ID  | Status | P  | Item |
|-----|--------|----|------|
| O-1 | todo   | P1 | Mimir helm release; OTel + Prom remote_write to it; Grafana datasource swap |
| O-2 | todo   | P1 | New `cloudops-mimir-blocks-<acct>` S3 bucket with versioning, KMS CMK, lifecycle |
| O-3 | todo   | P2 | Loki `replication_factor=3`, write replicas → 3, dedicated WAL PVC |
| O-4 | todo   | P2 | Prometheus 2 replicas, zone-spread, retention drops to 6h after Mimir lands |
| O-5 | todo   | P3 | Tempo ingester replicas → 3, metrics-generator on for RED metrics |
| O-6 | todo   | P2 | All observability buckets: versioning ON, lifecycle expiration 365d, force_destroy=false, KMS CMK |
| O-7 | todo   | P3 | Cross-region replication for observability buckets to a DR region |
| O-8 | todo   | P2 | Publish OTel base endpoint, `/v1/metrics`, `/v1/traces`, `/v1/logs`, and bearer token to SSM Parameter Store for SDK clients; custom libraries out of scope |

### 2. Data layer

| ID  | Status | P  | Item |
|-----|--------|----|------|
| D-1 | todo   | P1 | RDS `multi_az=true`, `deletion_protection=true`, `skip_final_snapshot=false`, backup retention 35d |
| D-2 | todo   | P2 | RDS read replica + read-only DB user wired to app for analytics queries |
| D-3 | todo   | P1 | Secrets Manager 30-day rotation on the master credential via the rotation Lambda |
| D-4 | todo   | P2 | RDS Proxy in front of the cluster — connection pooling for app pod scale-out |
| D-5 | todo   | P2 | AWS Backup vault: RDS + EBS daily/weekly/monthly schedules, KMS-encrypted, vault lock |
| D-6 | todo   | P3 | Performance Insights retention 7d → 731d (long-term) |

### 3. Networking

| ID  | Status | P  | Item |
|-----|--------|----|------|
| N-1 | todo   | P1 | NAT gateways across 3 AZs (was off in dev) |
| N-2 | todo   | P2 | VPC flow logs to S3 + Athena partitioned table for query |
| N-3 | todo   | P3 | Network ACLs: explicit deny-all default, allow only required CIDRs/ports |
| N-4 | todo   | P4 | Transit Gateway scaffold for future multi-VPC even if single VPC today |
| N-5 | todo   | P3 | Audit existing PrivateLink / VPC interface endpoints — currently 12+; verify all required |

### 4. EKS

| ID  | Status | P  | Item |
|-----|--------|----|------|
| K-1 | todo   | P1 | 3 AZ node groups, min 2 nodes per AZ |
| K-2 | todo   | P1 | Control plane logs: api / audit / authenticator / controllerManager / scheduler all to CloudWatch |
| K-3 | todo   | P2 | EBS CSI: gp3 default, encryption with CMK, snapshot lifecycle policy |
| K-4 | todo   | P2 | Karpenter replaces or augments Cluster Autoscaler |
| K-5 | todo   | P2 | OPA Gatekeeper: enforce mode (not audit) for require-resource-limits, deny-:latest, require-IRSA, no-NodePort, no-hostNetwork, require liveness/readiness |
| K-6 | todo   | P3 | Falco → GuardDuty integration via SQS |
| K-7 | todo   | P2 | Default-deny NetworkPolicy in every namespace; explicit allows |
| K-8 | todo   | P1 | Pod Security Standards `restricted` profile enforced via admission |

### 5. Ingress / edge

| ID  | Status | P  | Item |
|-----|--------|----|------|
| E-1 | todo   | P1 | WAFv2 on public ALBs: AWSManagedRulesCommonRuleSet, KnownBadInputs, SQLi, rate-based 2000/5min/IP, geo block list |
| E-2 | todo   | P2 | CloudFront in front of ALB: edge cache + DDoS shield, ACM cert in us-east-1 |
| E-3 | blocked| P4 | Shield Advanced subscription (~$3k/mo, business decision) |
| E-4 | todo   | P3 | Route 53 health checks + failover to a static maintenance page |

### 6. Application

| ID  | Status | P  | Item |
|-----|--------|----|------|
| A-1 | todo   | P1 | Real auth: Cognito User Pool + JWT, or OIDC (Auth0/Okta). Validate via JWKS w/ caching |
| A-2 | todo   | P1 | Per-tenant rate limit instead of per-IP |
| A-3 | todo   | P2 | mTLS service-to-service via service mesh (see §7) |
| A-4 | todo   | P1 | Tenancy model in DB: `tenant_id` column, row-level security, query interceptor enforces |
| A-5 | todo   | P2 | Audit log table for every state-changing call |
| A-6 | todo   | P2 | Idempotency keys on POST /order |
| A-7 | todo   | P2 | API versioning: `/v1/order`, `Accept-Version` header |
| A-8 | todo   | P3 | OpenAPI spec committed + Spectral lint in CI |
| A-9 | todo   | P3 | E2E distributed tracing context propagation verified (W3C traceparent) |

### 7. Service mesh (mTLS)

| ID  | Status | P  | Item |
|-----|--------|----|------|
| M-1 | todo   | P2 | Cilium with Hubble + Cilium Service Mesh: kernel-level, replaces kube-proxy, mTLS + L7 policy + observability |
| M-2 | todo   | P3 | Promote NetworkPolicies → CiliumNetworkPolicies (L7-aware) |

Alternative: Istio ambient mode if Cilium doesn't fit. Decide via ADR.

### 8. CI/CD

| ID  | Status | P  | Item |
|-----|--------|----|------|
| C-1 | todo   | P1 | Separate state per environment (dev/staging/prod), each its own S3 backend key. Not just var-files. |
| C-2 | todo   | P1 | Manual approval gate on prod deploys via GitHub environment + required reviewers |
| C-3 | todo   | P2 | Drift detection scheduled run, opens an issue on diff |
| C-4 | todo   | P1 | Image promotion: dev → staging → prod via tag promotion, never rebuild |
| C-5 | todo   | P2 | SLSA Level 3 provenance: GitHub OIDC + reusable workflow + signed attestation (cosign already in place) |
| C-6 | todo   | P2 | Dependabot + automated PR security scanning |
| C-7 | todo   | P3 | CodeQL on the app |
| C-8 | todo   | P3 | Trivy + Grype + SBOM diff between releases |
| C-9 | todo   | P4 | Chaos Mesh weekly run in staging, verifies SLO holds under faults |
| C-10 | todo | P3 | Root folder cleanup: move operational scripts under `scripts/`, update references, and keep Terraform entrypoints stable until layered-state migration is complete |

### 9. Secrets & key management

| ID  | Status | P  | Item |
|-----|--------|----|------|
| S-1 | todo   | P1 | All Secrets Manager secrets: CMK-encrypted, rotation enabled where supported, 30-day rotation |
| S-2 | todo   | P1 | All KMS keys: separate CMK per data domain (state, RDS, observability-loki, observability-tempo, observability-mimir, secrets), 1-year automatic rotation, tight key policies |
| S-3 | todo   | P1 | External Secrets Operator in cluster — pulls from Secrets Manager, no plain k8s secrets |
| S-4 | todo   | P3 | Sealed Secrets as fallback for emergencies |

### 10. Compliance / audit

| ID  | Status | P  | Item |
|-----|--------|----|------|
| L-1 | todo   | P1 | CloudTrail org-wide, multi-region, log file validation, S3 + CMK + Object Lock |
| L-2 | todo   | P2 | AWS Config enabled with conformance pack (CIS, NIST, SOC2 baseline) |
| L-3 | todo   | P1 | GuardDuty enabled with EKS Protection, Malware Protection, S3 Protection |
| L-4 | todo   | P2 | Security Hub enabled with CIS + AWS Foundational + PCI-DSS standards |
| L-5 | todo   | P3 | Macie on observability buckets (PII detection in logs) |
| L-6 | todo   | P2 | IAM Access Analyzer for IAM + S3 + KMS |

### 11. Cost / FinOps

| ID  | Status | P  | Item |
|-----|--------|----|------|
| F-1 | todo   | P2 | Per-tenant cost allocation tags (tenant_id propagated) |
| F-2 | todo   | P3 | Compute Savings Plans modeled after baseline usage |
| F-3 | todo   | P3 | S3 Intelligent-Tiering instead of straight Glacier for unpredictable-access buckets |
| F-4 | todo   | P3 | CUR + Athena + QuickSight cost dashboard |

### 12. Ops

| ID  | Status | P  | Item |
|-----|--------|----|------|
| P-1 | todo   | P1 | Runbooks for top 20 alerts, machine-readable + linked from PrometheusRule annotations (partially done) |
| P-2 | todo   | P2 | On-call rotation in PagerDuty with escalation + suppression windows |
| P-3 | todo   | P3 | Game days quarterly: tabletop + live failure drill |
| P-4 | todo   | P3 | Capacity planning doc, reviewed quarterly |
| P-5 | todo   | P4 | ADRs for the architectural decisions (Mimir vs Thanos, Cilium vs Istio, Cognito vs Auth0) |

---

## Suggested rollout order

1. Bucket hardening + Mimir (O-1, O-2, O-6) — biggest data-durability win; cheap.
2. RDS multi-AZ + rotation + backup vault (D-1, D-3, D-5) — protects the only stateful data store.
3. WAF + auth + per-tenant rate limit (E-1, A-1, A-2) — public surface area.
4. State-per-env + manual prod approval (C-1, C-2) — blast radius.
5. KMS CMKs + Secrets rotation (S-1, S-2, S-3) — compliance baseline.
6. NAT + 3-AZ EKS + Karpenter (N-1, K-1, K-4) — runtime resilience.
7. Service mesh + L7 NetworkPolicies (M-1, M-2) — east-west traffic.
8. CloudTrail + GuardDuty + Config + SecHub (L-1, L-3, L-2, L-4) — audit.
9. Image promotion + SLSA L3 (C-4, C-5) — supply chain.
10. Everything else.

---

## Anti-goals

Things people often think they need at this scale but generally don't:

- **Multi-region active-active.** Rare to actually need; doubles infra cost and complexity. Active-passive DR with regional failover is the typical bar.
- **Self-managed Kubernetes control plane.** EKS managed control plane is the right call until you hit very specific extension points.
- **Self-hosted Vault.** Secrets Manager + KMS is sufficient unless you need on-prem secret access.
- **Custom service mesh.** Pick Cilium or Istio off-the-shelf; don't write one.
- **Bespoke auth.** Cognito or a managed IdP. Rolling your own JWT validation logic is a footgun.
