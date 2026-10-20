# Private EKS Access from CI

Backlog #52. Production tfvars (`environments/prod.tfvars.example`) sets
`eks_endpoint_public_access = false`, which keeps the API server reachable
only from within the VPC. GitHub-hosted runners live on the public internet
and cannot reach a private endpoint by default. Three supported access
strategies, in order of preference.

## 1. Self-hosted runners in the VPC (recommended)

Run a small autoscaling group of GitHub Actions self-hosted runners on EC2
inside the EKS-private subnets. They reach the API server over the same
private route as the cluster nodes.

- **Pros**: no internet exposure, no manual approval each deploy, the same
  workflow path works in dev/staging/prod.
- **Cons**: ~$15-30/month per always-on runner; lifecycle management
  (registration tokens, autoscaling on workflow demand).
- **Sketch**: launch template + ASG (1 instance min, 4 max), AWS-managed
  AMI, user-data that registers the runner with `gh` CLI using a registration
  token from a Secrets Manager secret. Tag runners with the env name; the
  workflow picks them up via `runs-on: [self-hosted, prod]`.

This is the right long-term fix. It is not yet implemented as Terraform in
this repo — track as a follow-up to #52 if/when prod traffic justifies the
spend.

## 2. SSM Session Manager + bastion

A tiny EC2 bastion in the VPC, reachable only via AWS SSM (no SSH, no public
IP). Operators run `aws ssm start-session` then proxy `kubectl` through it.

- **Pros**: zero open ports; covered by IAM and CloudTrail.
- **Cons**: not suitable for unattended CI runs; manual workflow.

Use this for break-glass operator access (debugging, one-off `kubectl exec`).
Not a CI deploy path.

## 3. Emergency public CIDR (break-glass only)

`.github/workflows/eks-emergency-access.yml` opens a temporary public access
window scoped to a single caller CIDR. Gated by the `production` GitHub
environment approval. Closes via the same workflow with `action=close`.

The window is intentionally **not** Terraform-managed:

- Opening it via the AWS API only changes the live cluster config; Terraform
  state is unchanged, so the next normal apply re-asserts the private-only
  configuration. This is a feature: emergency widening cannot accidentally
  become permanent.
- The workflow run summary captures who opened the window, the CIDR, the
  reason, and the timestamp — that's the audit trail.

Use only when:

- Private runners are not yet provisioned.
- The work cannot wait (incident, urgent rollback that requires API access).
- A specific operator IP can be approved.

## Required secrets

- `AWS_GITHUB_ACTIONS_ROLE_ARN` — already used by `infra.yml` / `app.yml`.
- `EKS_CLUSTER_NAME` — the cluster to open (`terraform -chdir=stacks/cluster output -raw cluster_name`).
- `AWS_REGION` — already used.

The other workflows read the cluster name from the cluster stack's outputs;
this one runs without Terraform state, so it takes it from the secret.

## Approval policy

The emergency workflow targets the `production` GitHub environment when
`environment=prod`, which forces required reviewer approval. For staging it
binds to the `staging` environment; configure that to either auto-approve or
require approval per your team's policy.
