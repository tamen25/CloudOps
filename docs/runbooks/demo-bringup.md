<!-- This document explains demo bringup automation for CloudOps. -->
# Demo Bring-Up Runbook

Closes backlog #90. Targets a clean AWS account with no prior CloudOps
infrastructure. Goal: from clean account to working storefront in **60
minutes**.

---

## Pre-requisites

- AWS account with admin credentials configured locally (`aws sts get-caller-identity` works).
- Domain registered + apex Route 53 hosted zone in the target account.
- Required GitHub Actions secrets: see [README §3](../../README.md#step-2--github-secrets).
- `terraform` 1.11+, Node 22+, `git` installed locally.

---

## Stage 1 — Bootstrap (5 min)

```bash
# Creates the OIDC role + S3 state bucket + ECR pull-through cache.
bash scripts/oidc.sh                            # one-time prep
bash scripts/tf-init.sh                         # init with state bucket
terraform apply -target=module.bootstrap        # state bucket + OIDC
```

Verify:

```bash
aws s3 ls | grep cloudops-tfstate
aws iam list-open-id-connect-providers | grep token.actions.githubusercontent.com
```

---

## Stage 2 — Foundation (10 min)

```bash
bash scripts/terraform-stacks.sh apply foundation
```

Provisions: VPC, subnets, route tables, NAT, Route 53 zone link, RDS
Postgres `db.t4g.micro`, secrets, KMS.

---

## Stage 3 — Cluster (20 min — EKS provision is slow)

```bash
bash scripts/terraform-stacks.sh apply cluster
```

Provisions: EKS control plane, node group, OIDC provider, addon config.
Most of the 20 min is the EKS control plane API endpoint coming up.

---

## Stage 4 — Platform (15 min)

Enable storefront-relevant modules in `terraform.tfvars`:

```hcl
enable_auth                = true
enable_storefront_search   = true
enable_storefront_cart     = true
enable_storefront_events   = true
enable_storefront_realtime = true
enable_storefront_checkout = true
enable_storefront_assets   = true
enable_observability       = true
enable_yace                = true
```

Then:

```bash
bash scripts/build-lambdas.sh                   # installs Lambda deps
bash scripts/terraform-stacks.sh apply platform
```

Provisions: ingress controller, observability (Prom + Loki + Tempo +
Grafana + yace + storefront dashboard + alerts), Cognito User Pool +
Hosted UI, API GW HTTP (search), API GW WebSocket, Step Functions,
SQS, S3 assets bucket, CloudFront, all Lambdas.

---

## Stage 5 — Seed data (5 min)

```bash
# Apply order-api migrations (006_products.sql joins the queue).
kubectl apply -f apps/order-api/k8s/migration-job.yaml

# Seed catalog with 50 products × 3 tenants.
DATABASE_URL=$(aws secretsmanager get-secret-value --secret-id <db-secret-arn> --query SecretString --output text \
  | jq -r '"postgres://\(.username):\(.password)@\(.host):\(.port // 5432)/cloudops"')
TENANTS=acme,globex,initech npx tsx apps/order-api/scripts/seed-products.ts
```

Create a Cognito test user under the `acme` tenant:

```bash
POOL_ID=$(terraform -chdir=stacks/platform output -raw cognito_user_pool_id)
aws cognito-idp admin-create-user \
  --user-pool-id "$POOL_ID" \
  --username demo@example.com \
  --user-attributes Name=email,Value=demo@example.com \
                    Name=email_verified,Value=true \
                    Name=custom:tenant_id,Value=acme \
  --temporary-password 'TempPass!2026'
```

---

## Stage 6 — Smoke test (5 min)

| Endpoint | Expected |
|---|---|
| `https://api.<domain>/health` | `{ status: "ok" }` |
| `https://<domain>/` | storefront home (RSC) |
| `https://<domain>/products` | catalog with 50 items |
| `https://<domain>/login` | redirect to Cognito Hosted UI |
| `https://search.<domain>/search?q=widget` (with JWT) | ranked results |
| `wscat -c wss://ws.<domain>?token=<jwt>` | "connected" |

---

## Troubleshooting

- Pods stuck `ImagePullBackOff`: ECR pull-through cache prefix must
  resolve. See [master-runbook](master-runbook.md).
- Cognito Hosted UI 503: ACM cert in `us-east-1` is missing.
- `/_internal/search` 503 from the Lambda: SSM parameter holding
  `INTERNAL_HMAC_SECRET` not yet created. Apply the platform stack
  again after secrets are seeded.
