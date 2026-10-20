# Permissions boundary for workload roles

The deployer (the human `cloudops-deployer` role and the CI
`cloudops-github-actions` role) may create and change the project's own IAM
roles. Without a boundary, it could create a role with any policy, trust that
role, and act through it. The permissions boundary closes that path:

- **The boundary** (`cloudops-permissions-boundary`,
  `modules/bootstrap/permissions_boundary.tf`) caps every workload role.
  Allowed: every action except IAM writes and Organizations or account
  actions. The exceptions it keeps are IAM reads, creating service-linked
  roles (the load-balancer controller) and attaching the budget hard-cap deny
  policy (finops).
- **The deployer**, once the boundary is on, can create or change a
  `cloudops-*` role only if that role carries the boundary. It can never
  remove a boundary or edit the boundary policy. It can never change the
  two bootstrap roles, its own included, and it can never assume a
  `cloudops-*` role.

All 34 workload roles take the boundary. The two bootstrap roles do not: an
administrator applies them. `scripts/check-permissions-boundary.sh` (CI,
`quality`) fails when a new role or module call misses it. The policy
documents are tested in `modules/bootstrap/tests/`.

The boundary policy always exists. The switch, `bootstrap_enable_permissions_boundary`
(default `false`), decides whether it is enforced and attached. IAM will not
delete a policy that is still the boundary of a role in another stack, so a
switch that also created and deleted the policy could not be turned off in
one apply.

## Turn it on

The bootstrap module is applied by an administrator with credentials outside
the deployer roles, as on first install. With the boundary on, the deployer
can no longer change the bootstrap roles or the boundary policy.

**Layered stacks** (`stacks/`):

1. Administrator: set `bootstrap_enable_permissions_boundary = true` in the
   foundation tfvars, then `terraform -chdir=stacks/foundation apply`. The
   foundation's own roles (flow logs, RDS monitoring, Config, Backup) take
   the boundary in the same apply. The `permissions_boundary_arn` output is
   now set.
2. Apply `stacks/cluster`, then `stacks/platform`, as usual (CI or the
   deployer role). Each reads the boundary ARN from the foundation state and
   puts it on its roles. Until a stack is applied, the deployer cannot put
   or attach policies on that stack's roles. Apply both stacks right after
   step 1.

With `use_remote_state_foundation = false`, pass `permissions_boundary_arn`
to the cluster and platform stacks yourself.

**Root layout** (`main.tf`): set `bootstrap_enable_permissions_boundary = true`
and apply as an administrator. Every role takes the boundary in one apply.

## Verify

```bash
# Every cloudops role but the two bootstrap roles carries the boundary.
for r in $(aws iam list-roles --query "Roles[?starts_with(RoleName, 'cloudops-')].RoleName" --output text); do
  printf '%-50s %s\n' "$r" "$(aws iam get-role --role-name "$r" --query 'Role.PermissionsBoundary.PermissionsBoundaryArn' --output text)"
done

# The deployer is refused a role without it (expect AccessDenied).
aws iam create-role --role-name cloudops-boundary-probe \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[]}'
```

Run the second command as the deployer role. Then check that the workloads
still work: the load-balancer controller reconciles an Ingress, the budget
action is `STANDBY`, and the compliance scanner and auto-remediation Lambdas
run without `AccessDenied` in their logs.

## Turn it off

1. Administrator: set `bootstrap_enable_permissions_boundary = false` and
   apply foundation. This lifts the deployer's denies, removes the boundary
   from the foundation's roles and sets the `permissions_boundary_arn`
   output to null.
2. Apply `stacks/cluster` and `stacks/platform`. Each reads the null output
   and removes the boundary from its roles.

The policy stays, attached to nothing.

## What it does not cover

- A workload role still reaches everything its own policy grants, inside the
  boundary. The boundary stops IAM escalation, not a too-broad workload
  policy.
- The deployer can pass a `cloudops-*` role to compute it creates (Lambda,
  EC2, EKS), and that compute acts with the role's permissions. Those are
  capped by the boundary, which allows S3 beyond the project's buckets: the
  compliance scanner and auto-remediation work account-wide (ADR 009). The
  deployer's own S3 access is limited to project buckets.
- While the boundary is off, the deployer can still change the bootstrap
  roles (they match `cloudops-*`).
- Roles created by `scripts/oidc.sh` (the manual setup path) carry no
  boundary conditions. Use the Terraform bootstrap when the boundary is on.
