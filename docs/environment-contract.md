<!-- This document explains environment contract for CloudOps. -->
# Environment Contract

Backlog #46 source of truth. The goal is prod-shaped behavior at dev/staging
cost: every environment should exercise the same deployment and safety path,
while lower environments use cheaper resource sizes and shorter retention.

## Environments

| Environment | State prefix | GitHub environment | Purpose |
|-------------|--------------|--------------------|---------|
| dev | `dev/` | `dev` | Cheapest persistent test path. May use small compute and short retention, but must still run the same CI gates. |
| staging | `staging/` | `staging` | Prod-shaped rehearsal path. Destroyable and cheaper than prod, but deploy/auth/security behavior must match prod. |
| prod | `prod/` | `production` | Customer environment. Full durability, retention, approval, and teardown protection. |

Never use `environment = "prod"` for a disposable test stack unless it is in a
separate AWS account and separate backend bucket. Shared backend buckets use
the environment value as the state identity.

## Required Parity

These behaviors must stay the same in dev, staging, and prod:

| Area | Contract |
|------|----------|
| State layout | Use isolated per-environment state keys. Layered stacks use `<env>/<stack>/terraform.tfstate`. |
| Deploy path | Infra deploys platform prerequisites; app workflow owns build, sign, scan, render, migrate, deploy, rollout, integration test, and rollback. |
| Approvals | All deploy-capable jobs must bind to a GitHub environment. Prod approval is mandatory; staging approval is recommended; dev may use lightweight approval or self-approval. |
| Auth | Non-local deployments must configure OIDC or an explicitly scoped API-key secret. Unauthenticated data routes are local/unit-test only. |
| Security gates | IaC, image, manifest, signature, and admission checks must run in every deployed environment. Severity thresholds may not be lowered in cheaper envs. |
| Migrations | Database migrations run as a separate Kubernetes Job before app rollout. |
| Rollback | Rollout state is captured before deploy, and the rollback path is exercised by the same workflow shape. |
| Drift | Drift detection must plan each active environment and each Terraform stack separately. |
| Observability | Dashboards, alerts, traces, logs, and SLO paths stay enabled where the relevant module is enabled. |

## Allowed Differences

These can differ to keep AWS cost low:

| Area | Dev/staging allowance |
|------|-----------------------|
| Compute | Smaller node groups, smaller RDS classes, lower replica counts. |
| HA spend | Single-AZ or fewer replicas in dev; staging may use reduced HA when testing does not require failure-domain coverage. |
| NAT spend | NAT can be disabled in dev when private egress is not under test. |
| Retention | Shorter log, metric, trace, backup, and bucket retention. |
| Destroy safety | Dev/staging may disable deletion protection, final snapshots, object lock, vault lock, and force-destroy protection. |
| Data durability | Dev/staging may use shorter recovery windows and lower backup retention. |
| External integrations | Pager/webhook/email targets may be empty in dev, but alert resources should still exist. |

## Profiles

`environments/dev.tfvars.example` is the cheapest profile. It can use small
compute and minimal retention, but backlog #49 tracks turning on the full
prod-shaped behavior flags.

`environments/staging.tfvars.example` replaces the old prod-test profile. It
uses `environment = "staging"` so it cannot collide with prod state, and it
keeps prod-like feature flags with destroy-safe settings.

`environments/prod.tfvars.example` is the production launch profile. It keeps
public EKS endpoint disabled, OTel ingestion private, WAF/security/compliance
enabled, backups retained, and destroy protections on.

## Backlog Links

- #47: Workflows become environment-aware and use per-env secrets/roles.
- #48: PR contexts lose deploy-grade AWS access.
- #49: Dev/staging profiles become cheap but prod-shaped.
- #52: Private prod EKS endpoint gets a CI access path.
- #59: Drift detection becomes per-env and per-stack.
