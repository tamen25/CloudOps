# ADR 011 — Layered Terraform State

**Status:** Accepted
**Date:** 2026-05-09
**Authors:** CloudOps platform

---

## Context

The original repository used a single root Terraform module that owned every
resource: bootstrap (OIDC, ECR cache, state bucket), networking, EKS,
Helm/Kubernetes addons, observability, security policies, RDS, and FinOps
glue. A single `terraform plan` therefore had to evaluate the Kubernetes
provider, which itself depended on EKS being live. The chicken-and-egg made
clean apply paths impossible:

- `terraform plan` failed on a fresh account because the Kubernetes
  provider's data sources tried to reach an unprovisioned cluster API.
- The CI workflow papered over this by running `terraform apply` with a
  cascade of `-target=module.bootstrap`, `-target=module.networking`, then
  EKS, then everything else, with `continue-on-error` toggles between
  steps.
- A successful end-to-end apply required keeping the Kubernetes provider
  pointed at `localhost` until very late in the chain. Any contributor who
  forgot the toggle saw confusing `connect: connection refused` errors.

The destructive path had the same problem in reverse. `terraform destroy`
needed `-target` choreography to remove Helm releases before the cluster,
the cluster before networking, and networking before bootstrap. One step
out of order silently leaked resources or left state inconsistent.

We considered three options:

1. **Status quo** — keep the single root and document the `-target` order.
   Cheap to leave alone but every plan is risky and onboarding hard.
2. **Terragrunt** — wrapper layer that runs per-stack apply with shared
   variables. Adds a tool and a config language we did not otherwise
   need; CI runners would have to install it; engineers debugging an
   apply have one more abstraction between them and `terraform`.
3. **Layered native Terraform stacks** — split the root into separate
   working directories (`stacks/foundation`, `stacks/cluster`,
   `stacks/platform`), each with its own backend key, communicating via
   `terraform_remote_state`. Vanilla Terraform; no extra dependency.

## Decision

We split the root Terraform into three layered stacks under `stacks/`:

- **`stacks/foundation`** — bootstrap, DNS, networking, database,
  compliance/backup. No Kubernetes provider.
- **`stacks/cluster`** — EKS cluster + node groups. Reads foundation
  outputs via `terraform_remote_state`. No Helm/Kubernetes resources.
- **`stacks/platform`** — Helm releases (LBC, kube-prometheus-stack, Loki,
  Tempo, OTel Collector, Falco, Gatekeeper) + Kubernetes manifests +
  observability/security/self-healing/SLO/FinOps modules. Kubernetes and
  Helm providers are configured against the cluster outputs from the
  `stacks/cluster` state file.

Each stack writes to its own backend key under the same S3 bucket:
`<env>/foundation/terraform.tfstate`, `<env>/cluster/terraform.tfstate`,
`<env>/platform/terraform.tfstate`. The CI workflow runs them in order
via `scripts/terraform-stacks.sh`.

The legacy single-root entrypoints (`main.tf`, `provider.tf`, etc.) stay in
the repository as a break-glass migration path, gated behind
`LEGACY_ROOT_APPLY=1`. They will be deleted once the migration runbook is
validated against a real environment (tracked in backlog #16).

Cross-stack dependencies are explicit: `stacks/cluster` reads
`foundation_state` outputs by key; `stacks/platform` reads `cluster_state`
outputs the same way. There is no implicit data flow.

## Consequences

**Positive:**
- Each stack plans independently. A platform-only change does not
  re-evaluate networking or EKS providers.
- Destruction is layered: `stacks/platform` destroy removes Helm releases
  before `stacks/cluster` removes EKS.
- Per-env per-stack state keys mean drift detection (#59) reports cleanly
  per cell instead of one giant blast radius.
- No tool dependency beyond Terraform itself.

**Negative:**
- Outputs that previously crossed module boundaries within one root now
  travel through `terraform_remote_state` reads. If the provider
  authenticates differently for each stack we need consistent IAM in CI.
- The break-glass legacy root path lives until #16 closes. New code must
  not assume the layered stacks are the only entry.

**Revisit if:** the layered design proves too rigid (e.g., a new platform
addon needs networking-layer outputs that did not previously exist) and
the cost of keeping cross-stack outputs in sync outweighs the apply
simplicity. At that point Terragrunt (option 2) is the next candidate.
