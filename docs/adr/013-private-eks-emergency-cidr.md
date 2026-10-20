# ADR 013 — Private EKS Endpoint with Emergency CIDR Break-Glass

**Status:** Accepted (interim — superseded by self-hosted runner once
backlog #76 lands)
**Date:** 2026-05-09
**Authors:** CloudOps platform

---

## Context

Backlog #52 made the EKS public endpoint OFF by default in non-dev envs.
That closed a real exposure (the API server was reachable from any IP),
but it also broke deploys: the GitHub-hosted CI runner is not in the
cluster's VPC, so it cannot reach a private-only endpoint.

Three patterns are commonly used to bridge this gap:

1. **Self-hosted runner inside the VPC** — long-term correct answer. The
   runner is a normal node in private subnets, IAM-scoped, and reaches
   the API over private DNS. CI traffic never crosses public internet.
   Higher operational cost: capacity provisioning, GitHub registration
   tokens, autoscaling, patching.
2. **SSM Session Manager bastion** — operator-driven. An IAM user/role
   opens an SSM tunnel and runs `kubectl` from a bastion. Good for
   incident response; not viable as a CI deploy path because the tunnel
   is tied to a human session.
3. **Emergency public-CIDR widening** — temporary. A workflow flips
   `endpointPublicAccess = true` with `publicAccessCidrs = [<one CIDR>]`
   for a defined window, then flips it back. Easy to ship; auditable;
   does not require runner infrastructure.

Pattern 1 is correct but represents real new infrastructure (#76 is its
own backlog item). Pattern 2 is fine for operators but not for CI.
Pattern 3 is the smallest possible workaround that keeps the cluster
private by default while letting CI deploys complete in the meantime.

## Decision

Ship pattern 3 as the interim CI deploy path:
`.github/workflows/eks-emergency-access.yml`. Inputs:

- `environment` — dev / staging / prod (`prod` requires the GitHub
  `production` environment approval).
- `action` — `open` or `close`.
- `cidr` — IPv4 `/32` or larger; required for `open`. Validated.
- `reason` — required free text; surfaced in the run summary.

The workflow uses the AWS API directly, not Terraform. State stays
private-only, so the next regular `terraform apply` re-asserts safety
even if a human forgets to run `close`. This is intentional — Terraform
is the source of truth for the safe configuration.

`docs/private-eks-access.md` documents the three options, when to use
each, and the audit policy (every emergency open must include a reason
that is captured in the run summary).

## Consequences

**Positive:**
- Cluster API stays private by default in staging and prod.
- CI can still deploy when self-hosted runners do not exist yet.
- `prod` runs require a manual approval through the `production`
  GitHub environment, so no single PR can punch a hole.
- Terraform always converges back to private-only — operator forgetfulness
  cannot leave the endpoint open across applies.

**Negative:**
- The break-glass requires manual intervention every deploy — friction
  against frequent prod releases.
- A misconfigured CIDR (`0.0.0.0/0` typed instead of a `/32`) widens the
  exposure beyond intent. The workflow validates the CIDR shape but
  cannot validate intent.
- Until #76 lands, CI deploys to private endpoints depend on the
  workflow being run in the right window.

**Revisit when:** backlog #76 (self-hosted runner in VPC) ships. At that
point the emergency workflow stays as break-glass for incident response,
but normal CI deploys go through the in-VPC runner and this ADR becomes
historical.
