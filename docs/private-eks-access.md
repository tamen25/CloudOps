# Private EKS Access from CI

Backlog #52. Production tfvars (`environments/prod.tfvars.example`) sets
`eks_endpoint_public_access = false`, which keeps the API server reachable
only from within the VPC. GitHub-hosted runners live on the public internet
and cannot reach a private endpoint by default. Three supported access
strategies, in order of preference.

## 1. Self-hosted runners in the VPC (recommended)

Actions Runner Controller on the platform cluster runs one ephemeral runner
pod per job, inside the VPC, so jobs reach the private API server the way
the nodes do. Built as `modules/ci-runner` (ADR 025), off by default; the
cluster jobs move onto it when the `DEPLOY_RUNNER` repository variable is
set. Setup, limits and the outage path: `docs/runbooks/ci-runner.md`.

- **Pros**: no internet exposure, no manual approval per deploy, one
  workflow path for every environment; a clean pod per job.
- **Cons**: the runners live on the cluster they deploy to. Destroy, and
  changes that replace the nodes or the runners themselves, run on
  GitHub-hosted runners with emergency access (3).

## 2. SSM Session Manager + bastion

A tiny EC2 bastion in the VPC, reachable only via AWS SSM (no SSH, no public
IP). Operators run `aws ssm start-session` then proxy `kubectl` through it.

- **Pros**: zero open ports; covered by IAM and CloudTrail.
- **Cons**: not suitable for unattended CI runs; manual workflow.

Use this for break-glass operator access (debugging, one-off `kubectl exec`).
Not a CI deploy path.

## 3. Emergency public CIDR (break-glass only)

`.github/workflows/eks-emergency-access.yml` opens a temporary public access
window scoped to a single caller CIDR, in dev, staging or prod, and waits
until EKS has applied it. Prod is gated by the `production` GitHub
environment approval. Closes via the same workflow with `action=close`,
which turns the public endpoint off.

The Destroy workflow opens the endpoint to its own runner by itself before
destroying the platform stack, so a teardown needs no emergency window.

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
`environment=prod`, which forces required reviewer approval. For dev and
staging it binds to the `dev` and `staging` environments; configure those to
either auto-approve or require approval per your team's policy.
