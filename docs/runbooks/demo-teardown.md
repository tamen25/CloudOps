<!-- This document explains demo teardown automation for CloudOps. -->
# Demo Tear-Down Runbook

Closes backlog #90. Reverses the demo bring-up cleanly so the AWS bill
goes back to ~$0 between sessions.

---

## Order matters

```
SF executions  →  Kinesis drain  →  S3 empty  →  Dynamo TTL
                ↓
platform stack  →  cluster stack  →  foundation stack  →  bootstrap (optional)
```

The destroy script (`scripts/destroy.sh`) walks this list. Run it with
`--mode=full` for a complete teardown; without flags it preserves
Route 53 + OIDC + the state bucket so the next bring-up is faster.

---

## Stage 1 — Stop in-flight side effects

```bash
# Stop running Step Functions executions.
SM_ARN=$(terraform -chdir=stacks/platform output -raw storefront_checkout_state_machine_arn)
aws stepfunctions list-executions --state-machine-arn "$SM_ARN" --status-filter RUNNING \
  --query 'executions[*].executionArn' --output text \
  | xargs -n1 -I{} aws stepfunctions stop-execution --execution-arn {}
```

---

## Stage 2 — Empty data stores

```bash
# Empty S3 buckets that have force_destroy=false.
BUCKET=$(terraform -chdir=stacks/platform output -raw storefront_assets_bucket_name)
aws s3 rm "s3://$BUCKET" --recursive

# Truncate cart Dynamo (TTL would eventually clear it, but speed it up).
TABLE=$(terraform -chdir=stacks/platform output -raw storefront_cart_table_name)
aws dynamodb scan --table-name "$TABLE" --projection-expression "pk, sk" --output json \
  | jq -r '.Items[] | @json' \
  | while read row; do
      aws dynamodb delete-item --table-name "$TABLE" --key "$row" >/dev/null
    done
```

Kinesis: in `ON_DEMAND` mode the stream charges per hour while it
exists. Destroying the platform stack is enough — no manual drain
needed.

---

## Stage 3 — Platform stack

```bash
bash scripts/terraform-stacks.sh destroy platform
```

Cleans up: Cognito User Pool (deletion_protection=INACTIVE in non-prod),
CloudFront distribution (slow — global propagation), API GW HTTP +
WS, Lambdas, SQS, Step Functions, S3 assets bucket, ingress, helm
releases, observability ConfigMaps + PrometheusRules.

---

## Stage 4 — Cluster stack

```bash
bash scripts/terraform-stacks.sh destroy cluster
```

EKS teardown is the slow part (5-10 min). Node group drains first,
then the control plane.

---

## Stage 5 — Foundation stack

```bash
bash scripts/terraform-stacks.sh destroy foundation
```

RDS: respects `database_deletion_protection`. In `dev` this is
`false`; if you flipped it on locally, set it back before destroy.

---

## Stage 6 (optional) — Bootstrap

```bash
bash scripts/destroy.sh --nuke-bootstrap
```

Removes the state bucket + OIDC provider + ECR pull-through cache.
Skip unless you are wiping the account entirely.

---

## Cost gotchas

| Resource | Charge while alive | Killed by |
|---|---|---|
| EKS control plane | $0.10/hr | cluster destroy |
| RDS db.t4g.micro | ~$0.018/hr | foundation destroy |
| NAT Gateway | $0.045/hr | foundation destroy |
| Kinesis on-demand | $0.04/hr + per-GB | platform destroy |
| CloudFront | $0 idle | platform destroy (slow propagation) |
| S3 + Dynamo on-demand | ~$0 idle | n/a |
| Cognito | free <50k MAU | platform destroy |

Total active demo cost: ~$0.20/hr. Destroyed: ~$0.

---

## Common failures

- `destroy` fails on the S3 assets bucket: bucket isn't empty.
  Re-run Stage 2 then retry.
- `destroy` fails on CloudFront: distribution is still propagating.
  Wait 5-10 min and retry.
- `destroy` fails on RDS: `deletion_protection=true` or
  `skip_final_snapshot=false`. Flip both off in tfvars then retry.
