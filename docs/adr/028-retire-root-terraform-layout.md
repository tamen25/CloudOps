# ADR 028 — Retire the root Terraform layout

**Status:** Accepted
**Date:** 2026-10-20
**Supersedes:** the migration plan in ADR 011

---

## Context

ADR 011 split the single root module into three layered stacks under
`stacks/` and kept the root (`main.tf`, `variables.tf`, `outputs.tf`,
`provider.tf`) as a break-glass path until environments were migrated. By
October 2026:

- CI planned, applied and drift-checked only the stacks. The root apply
  steps in `infra.yml` sat behind `LEGACY_ROOT_APPLY`, set to `0`.
- No environment had been built from the root; the dev account held only a
  stale state object from it. There was nothing to migrate.
- Both layouts called the same modules, so every module change had to be
  wired into two places (the permissions boundary, S08, touched both).
- The two layouts used different states, and the tooling mixed them: the
  Destroy workflow and `scripts/destroy.sh` worked on the root while CI
  deployed the stacks. Run on a stacks environment, the workflow would have
  created a root copy, destroyed it, and deleted the state bucket the
  stacks use, leaving the real environment running without state (fixed in
  #36).

## Decision

Remove the root layout: `main.tf`, `variables.tf`, `outputs.tf`,
`provider.tf` and its lock file; `scripts/deploy.sh` and
`scripts/destroy.sh`, which drove it; the `LEGACY_ROOT_APPLY` steps in
`infra.yml`. `scripts/tf-init.sh` requires `STACK`. Infracost reads the three
stacks from `infracost.yml`. The foundation stack gains the outputs only the
root had a use for (`github_actions_role_arn`, `deployer_role_arn`,
`database_endpoint`).

Every apply, plan and destroy goes through the stacks, by hand or with
`scripts/terraform-stacks.sh` (forward order to apply, reverse to destroy).

## Consequences

- One place to wire a module, one state per stack, one set of runbooks.
- Bootstrap on a new account is `-target=module.bootstrap` on the foundation
  stack, after the state bucket exists (`modules/bootstrap/create-s3-bucket.sh`).
- An environment built from the root, if one existed elsewhere, would need
  its resources imported into the stacks. None is known.
- `terraform.tfvars` stays at the repo root; the stacks read it with
  `-var-file`. Variables only the root used are ignored with a warning.
