# ADR 025 — Self-hosted GitHub runner in VPC (design)

**Status:** Proposed (design only; no runner deployed yet)
**Date:** 2026-05-14
**Closes:** backlog #76 (design portion)
**Related:** ADR 013 (private-EKS emergency CIDR — kept as break-glass)

## Context

`.github/workflows/infra.yml` and `app.yml` run on GitHub-hosted runners
(`ubuntu-latest`). When `endpoint_public_access = false` and
`endpoint_public_access_cidrs` is empty (the prod target shape — see
`modules/eks/variables.tf:118` and ADR 013), hosted runners cannot reach
the EKS control plane. Today the only path is
`.github/workflows/eks-emergency-access.yml`, which temporarily widens
the EKS public-access CIDR list to a fresh runner egress IP. That is
explicitly break-glass — not the normal deploy path.

We need a **normal** CI path for cluster-touching jobs that does not
involve widening the EKS public endpoint at deploy time. Three patterns
were considered.

## Options considered

### Option A — EC2 self-hosted runner (long-running)

Pattern: one or more EC2 instances in private subnets, registered as
self-hosted runners against the repo/org. Auto-scaling group, AMI
managed via SSM Patch Manager or rebuild-on-deploy.

Pros:
- Simple mental model — `runs-on: [self-hosted, vpc, prod]`.
- IAM via instance profile, no token plumbing inside the job.
- Cheapest at low job volume.

Cons:
- Long-running runners hold a registration token; compromise = job
  forge.
- Patching is the operator's problem.
- Scaling is coarse; idle EC2 costs money overnight.
- Job isolation across runs is workflow-discipline, not infra.

### Option B — Actions Runner Controller (ARC) on EKS

Pattern: deploy `actions-runner-controller` on the platform EKS cluster
(`stacks/platform`). Runners spawn as ephemeral Pods per job. Helm chart
maintained by the GitHub Actions community.

Pros:
- Ephemeral by default — every job gets a clean pod, no cross-job leak.
- IAM via IRSA on the runner ServiceAccount — finest-grained option.
- Autoscaling is Kubernetes-native (HPA + queue depth metrics).
- Reuses the cluster we already operate.

Cons:
- **Chicken-and-egg risk**: if the *cluster* is down, the runners that
  deploy the cluster are also down. Mitigation = keep one EC2 break-glass
  runner OR keep the emergency CIDR workflow as the recovery path.
- Adds an admission-time dependency on the cluster being healthy enough
  to schedule pods on the deploy critical path.
- Helm chart + CRD operator surface to upgrade.
- Runner image needs Terraform / kubectl / aws-cli baked in (or fetched
  per job — slow).

### Option C — AWS-managed runner pattern

GitHub-hosted "larger runners" with VPC connectivity are an
organization-billing feature; not available to personal accounts on this
plan. AWS CodeBuild fronting GitHub Actions via the
`aws-actions/aws-codebuild-run-build` action is technically VPC-capable
but moves CI off GitHub Actions runners proper.

Pros:
- No runner host to operate.

Cons:
- Plan/feature gates.
- CodeBuild route changes the entire workflow model.
- Not available on the current GitHub plan tier.

## Decision

**Adopt Option B (ARC on EKS) for the normal CI path, with an EC2
break-glass runner held in reserve.**

Rationale:
1. Job-level isolation is the right baseline for a deploy runner that
   handles cluster-admin-level credentials.
2. IRSA is strictly tighter than EC2 instance profiles for
   per-workflow scopes.
3. The chicken-and-egg risk is real but mitigated: if `stacks/cluster`
   is broken, we already need ADR 013's emergency CIDR path — that's
   what break-glass is *for*.
4. ARC's operational burden is bounded (one helm release, one CRD).
5. Cluster cost is already paid for the platform; ephemeral runner
   pods are marginal.

## Design (high-level)

### Module layout

- New `modules/ci-runner/` Terraform module containing:
  - `arc_controller.tf` — `helm_release.actions-runner-controller`
    pinned via Renovate.
  - `runner_irsa.tf` — IRSA role + trust policy + scoped IAM policy
    (Terraform `Resource = "arn:aws:eks:...:cluster/cloudops-*"`
    plus the per-stack S3 state bucket).
  - `runner_image.tf` — ECR repo for the custom runner image.
  - `runner_scaleset.tf` — `AutoscalingRunnerSet` CR via
    `kubernetes_manifest` for one labelled set
    (`runs-on: [self-hosted, vpc]`).
  - `secrets.tf` — `aws_secretsmanager_secret` for the GitHub App
    private key (or PAT during bootstrap).

### Runner image

- Base: `ghcr.io/actions/actions-runner:<version>`.
- Layered: `terraform`, `kubectl`, `helm`, `aws-cli`, `node`,
  `tsx`, `actionlint`.
- Built by a new `.github/workflows/runner-image.yml` on a hosted
  runner (this is *not* on the critical path of cluster operations).

### Workflow changes

- `infra.yml` `deploy` jobs: `runs-on: [self-hosted, vpc]`.
- `app.yml` `deploy` job: `runs-on: [self-hosted, vpc]`.
- All `plan` / `lint` / `test` jobs stay on hosted runners (no cluster
  reachability needed).
- `eks-emergency-access.yml` stays — explicitly relabelled as
  "ARC unavailable" recovery, not "tighten EKS endpoint".

### Bootstrap order

1. With EKS public endpoint still open (current dev state), apply
   `modules/ci-runner` from a hosted runner.
2. Verify a smoke-test job runs on the new label.
3. Tighten `endpoint_public_access = false` (or keep
   `public_access_cidrs` to a tight admin range).
4. Document the recovery path: if ARC dies, run
   `eks-emergency-access.yml` → fix → close.

### IAM scoping

Per-runner-set IRSA role grants:
- `eks:DescribeCluster`, `eks:AccessKubernetesApi` on the relevant
  cluster ARNs (per env).
- `sts:AssumeRole` to the existing GitHub Actions OIDC role (so the
  runner pod can still mint short-lived role sessions, matching the
  hosted-runner OIDC flow).
- Terraform state bucket: `s3:GetObject` / `s3:PutObject` on the
  env-prefixed state key.
- KMS: `kms:Decrypt` on the state-bucket CMK.

No long-lived AWS keys.

## Out of scope

- Building the module / writing the workflows / migrating jobs — this
  ADR is design only.
- Multi-region runner pools (we're single-region today).
- Webhooks for live job queueing (ARC default polling is fine at our
  cadence).

## Acceptance criteria (for the implementation story)

- `modules/ci-runner` applies cleanly into `stacks/platform`.
- One ARC `AutoscalingRunnerSet` provides the `[self-hosted, vpc]`
  label.
- At least one cluster-touching workflow (`app.yml` deploy) runs
  end-to-end on the new runner with `endpoint_public_access = false`.
- Emergency CIDR workflow remains green, repurposed as ARC-recovery
  not as the normal path.
- Runbook entry under `docs/runbooks/` covers: runner image rebuild,
  scale-set knobs, ARC controller upgrade, ARC outage recovery.

## Triggers to revisit

- GitHub's pricing on "larger hosted runners with VPC" drops onto
  this plan tier → reconsider Option C.
- A second cluster is added → revisit per-cluster vs centralized
  runner-set layout.
- Compliance forbids long-lived cluster control-plane access from
  GitHub-hosted networks even for plans → already covered, but the
  break-glass widening would also need to go.
