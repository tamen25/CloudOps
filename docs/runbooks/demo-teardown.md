# Demo Tear-Down Runbook

Closes backlog #90. Reverses the demo bring-up so the AWS bill goes back to
about $0 between sessions.

The **Destroy Infrastructure** workflow (Actions, needs the `production`
approval and the typed confirmation) runs every stage below in order. Use
the stages by hand only when the workflow cannot run, or to finish a
teardown it stopped part-way through.

Every stage works on the layered stacks (`stacks/`), the only Terraform
layout (ADR 028).

---

## Order matters

```
SF executions  →  empty buckets  →  platform stack  →  cluster's load balancers
               →  cluster stack  →  foundation stack (bootstrap included)  →  state bucket
```

Each stack reads the outputs of the ones before it, so they are destroyed in
the reverse of the order they were applied in.

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

## Stage 2 — Empty the data buckets

`force_destroy` is a variable on every bucket, so Terraform may refuse to
delete one with objects in it. Every bucket the modules create is named
`<project_name>-…`; empty all of them except the state bucket, which holds
the stacks' state until the end. The Destroy workflow's
`empty-s3-bucket` helper also removes object versions and delete markers.

Kinesis: in `ON_DEMAND` mode the stream charges per hour while it exists.
Destroying the platform stack is enough; no manual drain is needed.

---

## Stage 3 — Platform stack

```bash
STACKS=platform bash scripts/terraform-stacks.sh destroy
```

Cleans up: Cognito User Pool (deletion_protection=INACTIVE in non-prod),
API GW HTTP + WS, Lambdas (incl. mesh enrichment/analytics), SQS, Step
Functions, the polyglot mesh + loadgen Deployments/CronJob, EventBridge bus,
ingress, helm releases, observability ConfigMaps + PrometheusRules.

---

## Stage 4 — Load balancers the cluster created

The AWS Load Balancer Controller creates load balancers and target groups
for Ingresses and Services, outside Terraform. Left behind, they hold ENIs
and security groups, and the VPC cannot be deleted. Delete the ones tagged
`elbv2.k8s.aws/cluster=<project>-<environment>-cluster`, wait for them to go,
then delete their target groups. The Destroy workflow does this.

---

## Stage 5 — Cluster stack

```bash
STACKS=cluster bash scripts/terraform-stacks.sh destroy
```

EKS teardown is the slow part (5-10 min). Node group drains first,
then the control plane.

---

## Stage 6 — Foundation stack

```bash
STACKS=foundation bash scripts/terraform-stacks.sh destroy
```

Includes bootstrap: the OIDC provider, the GitHub Actions and deployer
roles, the KMS state key and the ECR pull-through cache. With the
permissions boundary on, the deployer cannot change the bootstrap roles,
so an administrator runs this stage
(docs/runbooks/security/permissions-boundary.md).

RDS: respects `database_deletion_protection`. In `dev` this is
`false`; if you flipped it on locally, set it back before destroy.

---

## Stage 7 — State bucket

The state bucket is created outside Terraform (`create-s3-bucket.sh`), so
no destroy removes it. Empty it (versions included) and delete it last,
once `STACKS=<stack> scripts/terraform-stacks.sh plan -destroy` shows
nothing left in any stack. With it gone, anything still running has no
state.

---

## Cost gotchas

| Resource | Charge while alive | Killed by |
|---|---|---|
| EKS control plane | $0.10/hr | cluster destroy |
| EKS nodes, 2 × t3.large on-demand (defaults) | $0.17/hr | cluster destroy |
| NAT Gateway | $0.045/hr each | foundation destroy |
| RDS db.t4g.micro | ~$0.018/hr | foundation destroy |
| Kinesis on-demand | $0.04/hr + per-GB | platform destroy |
| Load balancers (controller-created) | ~$0.02/hr each | stage 4 |
| CloudFront | $0 idle | platform destroy (slow propagation) |
| S3 + Dynamo on-demand | ~$0 idle | n/a |
| Cognito | free <50k MAU | platform destroy |

Active demo cost with the defaults: at least ~$0.37/hr before data
transfer, storage and CloudWatch. Destroyed: ~$0.

---

## Common failures

- `destroy` fails on an S3 bucket: it isn't empty.
  Re-run Stage 2 then retry.
- `destroy` fails on CloudFront: distribution is still propagating.
  Wait 5-10 min and retry.
- `destroy` fails on RDS: `deletion_protection=true` or
  `skip_final_snapshot=false`. Flip both off in tfvars then retry.
- Foundation `destroy` fails on the VPC or subnets: a controller-created
  load balancer or its ENIs remain. Run Stage 4, then retry.
