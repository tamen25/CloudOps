# Layered stacks (backlog #16)

The legacy single-root layout in this repo's top level (`main.tf`,
`outputs.tf`, etc.) provisions every module from one Terraform state. That
works, but it forces the dev workflow to choreograph apply order via `-target`
flags and makes the kubernetes/helm providers fall back to `localhost` on
fresh deploys.

This directory is the layered replacement. The first two stacks are
scaffolded now; the platform layer is the next split. Apply order:

| Order | Stack      | State key                            | Owns |
|-------|------------|--------------------------------------|------|
| 1     | foundation | `<env>/foundation/terraform.tfstate` | bootstrap, DNS, networking, database, compliance, backup |
| 2     | cluster    | `<env>/cluster/terraform.tfstate`    | EKS control plane + node group + addons + IRSA |
| 3     | platform   | `<env>/platform/terraform.tfstate`   | ingress, observability, security, self-healing, SLO, FinOps |
| 4     | apps       | `.github/workflows/app.yml`          | order-api Kubernetes manifests (already separate per backlog #18) |

Each downstream stack reads upstream outputs via `terraform_remote_state`,
so cross-stack data is explicit and versioned.

## Apply Order

```bash
# foundation first: no kubernetes provider, no chicken/egg
STACK=foundation ./scripts/tf-init.sh
terraform -chdir=stacks/foundation apply -var-file=../../terraform.tfvars

# then cluster: exports OIDC + endpoint that platform consumes
STACK=cluster ./scripts/tf-init.sh
terraform -chdir=stacks/cluster apply -var-file=../../terraform.tfvars

# then platform: kubernetes + helm providers are configured from cluster
# outputs unconditionally; no more localhost fallback
STACK=platform ./scripts/tf-init.sh
terraform -chdir=stacks/platform apply -var-file=../../terraform.tfvars
```

`scripts/tf-init.sh` derives `<env>/<stack>/terraform.tfstate` when `STACK`
is set. For downstream stacks, it also writes ignored `backend.auto.tfvars`
values that point at upstream remote state. `cluster` receives foundation
state settings; `platform` receives both foundation and cluster state settings.

## Why This Is Better

- **Plans are stable.** Each stack only knows about resources it owns. A
  change in the platform stack does not refresh the database state.
- **No `-target` choreography.** The legacy root requires staged applies
  (`-target=module.eks` then `-target=module.ingress` ...) on a fresh
  deploy. Per-stack applies eliminate that.
- **No localhost fallback.** The platform stack reads the cluster endpoint
  + OIDC URL from `terraform_remote_state` data, so the kubernetes/helm
  providers always have real values at plan time.
- **Per-stack blast radius.** Re-applying the platform stack cannot
  accidentally roll back a database change.
- **Per-env state isolation continues to work.** State keys are still
  derived from `environment` in `terraform.tfvars` (closes backlog #10);
  the stack name is appended (`<env>/<stack>/terraform.tfstate`).

## Migration From Legacy Single Root

The legacy root in this repo's top level remains the live source of truth
until you opt in. Migration is a one-time operation per environment:

1. Run `terraform state pull > legacy.tfstate` from the repo root with the
   existing `<env>/terraform.tfstate` backend.
2. For each layered stack, run `terraform import` against the live AWS
   resources. The simplest path is per-resource:
   ```bash
   terraform -chdir=stacks/foundation import 'module.networking[0].aws_vpc.main' vpc-XXXX
   ```
   Or use `terraform state mv` from a temporary local state file:
   ```bash
   terraform -chdir=stacks/foundation state mv \
     -state=../../legacy.tfstate \
     -state-out=terraform.tfstate \
     'module.networking[0].aws_vpc.main' \
     'module.networking.aws_vpc.main'
   ```
3. Apply each stack and confirm the plan reports "no changes".
4. Once all three stacks are migrated, archive `<env>/terraform.tfstate`
   and update `.github/workflows/infra.yml` to call the per-stack jobs.

For new environments, skip migration entirely: apply foundation, cluster, and
then platform once that stack is scaffolded.

## Status

- [x] Foundation stack scaffolded; calls existing modules and validates
- [x] Cluster stack scaffolded
- [x] Platform stack scaffolded
- [x] CI rewritten for per-stack plan/apply (`infra.yml` now plans/applies
      foundation -> cluster -> platform via `scripts/terraform-stacks.sh`)
- [ ] Migration runbook validated against a real environment
