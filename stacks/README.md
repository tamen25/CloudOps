# Layered stacks

All of CloudOps' Terraform lives here, in three stacks with a state each
(ADR 011). The single root module that came before them was retired
(ADR 028).

| Order | Stack      | State key                            | Owns |
|-------|------------|--------------------------------------|------|
| 1     | foundation | `<env>/foundation/terraform.tfstate` | bootstrap, DNS, networking, database, compliance, backup |
| 2     | cluster    | `<env>/cluster/terraform.tfstate`    | EKS control plane + node group + addons + IRSA |
| 3     | platform   | `<env>/platform/terraform.tfstate`   | ingress, observability, security, self-healing, SLO, FinOps, storefront, mesh |
| 4     | apps       | `.github/workflows/app.yml`          | order-api Kubernetes manifests |

Each downstream stack reads upstream outputs via `terraform_remote_state`,
so cross-stack data is explicit and versioned. All three read the same
repo-root `terraform.tfvars`.

## Apply and destroy

```bash
bash scripts/terraform-stacks.sh apply      # foundation, cluster, platform
bash scripts/terraform-stacks.sh destroy    # platform, cluster, foundation
STACKS=platform bash scripts/terraform-stacks.sh plan   # one stack
```

By hand, per stack:

```bash
STACK=foundation ./scripts/tf-init.sh
terraform -chdir=stacks/foundation apply -var-file=../../terraform.tfvars
```

`scripts/tf-init.sh` derives `<env>/<stack>/terraform.tfstate` from
`environment` in `terraform.tfvars`. For downstream stacks it also writes
ignored `backend.auto.tfvars` values that point at upstream remote state:
`cluster` receives foundation's, `platform` both foundation's and cluster's.

The full first-install walk-through is
`docs/runbooks/layered-stack-bringup.md`; teardown is
`docs/runbooks/demo-teardown.md`.

## Why stacks

- **Plans are stable.** Each stack only knows about resources it owns. A
  change in the platform stack does not refresh the database state.
- **No `-target` choreography.** One root module needed staged applies
  (`-target=module.eks` then `-target=module.ingress` ...) on a fresh
  deploy. Per-stack applies remove that.
- **No localhost fallback.** The platform stack reads the cluster endpoint
  and OIDC URL from `terraform_remote_state`, so the kubernetes and helm
  providers always have real values at plan time.
- **Per-stack blast radius.** Re-applying the platform stack cannot roll
  back a database change.

## Status

- [x] Foundation, cluster and platform stacks; CI plans and applies them in
      order (`infra.yml`), drift detection plans each one, and the Destroy
      workflow tears them down in reverse.
- [ ] First full bring-up on a live account (BACKLOG, AWS phase).
