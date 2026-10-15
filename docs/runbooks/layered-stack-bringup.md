<!-- This document is the local-execution runbook for backlog #16 layered-stack rollout. -->
# Layered Stack Bringup & Migration (backlog #16)

Local-laptop runbook for proving `stacks/foundation` → `stacks/cluster` →
`stacks/platform` works end-to-end against a real AWS environment. Two paths
covered:

- **Path A — fresh bringup** (no AWS resources exist; legacy state empty or stale).
- **Path B — migration from live legacy state** (resources already provisioned via root `main.tf`).

Path A is what dev runs today (2026-05-15 — account 278522729728 has zero
resources, only a stale `main/terraform.tfstate` blob in
`s3://cloudops-tfstate-tamen25/`). Path B is preserved for staging/prod once
those environments are stood up.

---

## Prerequisites

Run once before either path.

### Tools

| Tool       | Min version | Check                          |
|------------|-------------|--------------------------------|
| terraform  | 1.13.x      | `terraform version`            |
| aws        | 2.x         | `aws --version`                |
| kubectl    | 1.34.x      | `kubectl version --client`     |
| helm       | 3.x         | `helm version --short`         |
| jq         | 1.7+        | `jq --version`                 |
| git-bash or WSL | n/a    | `bash --version` (PS won't run `.sh` directly) |

Install missing tools first. On Windows: `winget install Helm.Helm jqlang.jq`.

### AWS access

```bash
aws sts get-caller-identity
```

Must return an identity with:
- S3 read/write on the bootstrap bucket (state)
- KMS decrypt on the tfstate CMK if `bootstrap_create_kms=true`
- Full IAM/EC2/EKS/RDS/Route53/etc. for the modules each stack creates

For dev, the `Tamen` IAM user already has admin. For staging/prod, assume the
deploy role first (`aws sts assume-role --role-arn ... --role-session-name ...`).

### Repo state

```bash
git status                      # should be clean or only have local tfvars/.tools/
cat terraform.tfvars | head -5  # confirm environment + bootstrap_bucket_name
```

Confirm `terraform.tfvars` exists at repo root and has at minimum:
```hcl
environment           = "dev"
bootstrap_bucket_name = "cloudops-tfstate-tamen25"
project_name          = "cloudops"
domain_name           = "<your domain>"
owner                 = "<your name/email>"
```

### State bucket pre-flight

```bash
aws s3 ls "s3://$(grep '^bootstrap_bucket_name' terraform.tfvars | sed 's/.*= *"\(.*\)".*/\1/')/"
```

If the bucket does not exist yet, run `scripts/bootstrap.sh` (or set
`SKIP_BUCKET_CHECK=1` and let foundation create it on first apply).

---

## Path A — Fresh Bringup (no resources exist)

Use when starting in a torn-down account. Skip the state-mv dance entirely.

### A1. Wipe any stale state (optional)

If `<env>/terraform.tfstate` from a previous root-layout run exists and you
are certain no live resources reference it, archive it:

```bash
aws s3 cp "s3://${BUCKET}/main/terraform.tfstate" "./archive/main-$(date +%Y%m%d).tfstate"
aws s3 rm  "s3://${BUCKET}/main/terraform.tfstate"
```

Do NOT delete state for an environment that still has live resources.

### A2. Apply foundation

```bash
STACK=foundation ./scripts/tf-init.sh
terraform -chdir=stacks/foundation plan  -var-file=../../terraform.tfvars -out=foundation.plan
terraform -chdir=stacks/foundation apply foundation.plan
```

Acceptance:
- Plan reports modules `bootstrap`, `dns`, `networking`, `database`,
  `compliance`, `backup` to add (whichever are enabled in tfvars).
- Apply completes. `aws s3 ls s3://${BUCKET}/dev/foundation/terraform.tfstate` returns the object.
- Outputs include `vpc_id`, `private_subnet_ids`, `route53_zone_id`,
  `rds_instance_id`, `bootstrap_bucket_name`, `name_prefix`, `account_id`.

### A3. Apply cluster

```bash
STACK=cluster ./scripts/tf-init.sh
terraform -chdir=stacks/cluster plan  -var-file=../../terraform.tfvars -out=cluster.plan
terraform -chdir=stacks/cluster apply cluster.plan
```

Acceptance:
- Plan reads foundation outputs (no errors about empty remote state).
- Plan adds `module.eks.aws_eks_cluster.main`, node group, IRSA roles.
- Apply completes (10-15 min for EKS control plane).
- `aws eks describe-cluster --name cloudops-dev-cluster --query 'cluster.status'` returns `ACTIVE`.
- Outputs include `cluster_name`, `cluster_endpoint`, `cluster_ca_certificate`,
  `oidc_provider_arn`, `oidc_provider_url`.

### A4. Apply platform

```bash
STACK=platform ./scripts/tf-init.sh
terraform -chdir=stacks/platform plan  -var-file=../../terraform.tfvars -out=platform.plan
terraform -chdir=stacks/platform apply platform.plan
```

Acceptance:
- Plan reads BOTH foundation and cluster outputs (real values, no `localhost`).
- Plan adds whichever of `ingress`, `observability`, `security`, `slo`,
  `finops`, `self_healing`, `auth`, storefront-* modules are enabled.
- Apply completes (longest stack; helm releases land on EKS).
- `kubectl get pods -A` shows ingress-nginx, monitoring/observability,
  gatekeeper, etc. depending on toggles.

### A5. Smoke test

```bash
kubectl get nodes
kubectl get pods -A | grep -E 'ingress|observability|gatekeeper|monitoring'
curl -sf "https://otel.${DOMAIN}/v1/metrics" -H "Authorization: Bearer ${TOKEN}" -X POST -d '{}' | jq .
```

### A6. Re-plan sanity check

Re-run plan for each stack. All three must report **no changes**.

```bash
TF_PLAN_DETAILED_EXITCODE=1 ./scripts/terraform-stacks.sh plan
echo "exit=$?"   # must be 0
```

Exit 0 = clean. Exit 2 = drift detected; investigate before declaring success.

---

## Path B — Migration From Live Legacy State

Use when an environment already has resources provisioned via the legacy
root `main.tf` and `<env>/terraform.tfstate`. Goal: move resource addresses
from legacy state into per-stack states without destroying or recreating
any live resource.

### B1. Backup legacy state

```bash
mkdir -p ./migration-backups
LEGACY_KEY="${ENV}/terraform.tfstate"
aws s3 cp "s3://${BUCKET}/${LEGACY_KEY}" "./migration-backups/legacy-$(date +%Y%m%d-%H%M%S).tfstate"
```

Verify the backup is non-empty (>1KB) before proceeding.

### B2. Pull legacy state to local working file

```bash
./scripts/tf-init.sh                    # init legacy root
terraform state pull > ./migration-backups/legacy.tfstate
terraform state list > ./migration-backups/legacy-addresses.txt
wc -l ./migration-backups/legacy-addresses.txt
```

### B3. Per-stack `state mv` from local file

Foundation, then cluster, then platform. For each stack:

```bash
# 3a. init the stack so it has a local backend pointer
STACK=foundation ./scripts/tf-init.sh

# 3b. work from a writable local copy of legacy state
cp ./migration-backups/legacy.tfstate ./stacks/foundation/legacy-source.tfstate

# 3c. move each address that belongs to this stack
terraform -chdir=stacks/foundation state mv \
  -state=legacy-source.tfstate \
  -state-out=terraform.tfstate \
  'module.bootstrap' \
  'module.bootstrap'
# repeat for: module.dns, module.networking, module.database,
# module.compliance, module.backup, module.codeartifact (whichever enabled)
```

Note: `terraform state mv` preserves count/for_each index suffixes (`[0]`,
`["us-east-1a"]`). Copy the address verbatim from `legacy-addresses.txt`.

### B4. Push the per-stack state to its S3 key

```bash
terraform -chdir=stacks/foundation state push terraform.tfstate
rm stacks/foundation/legacy-source.tfstate stacks/foundation/terraform.tfstate
```

### B5. Plan must report no changes

```bash
terraform -chdir=stacks/foundation plan -var-file=../../terraform.tfvars
# expected: "No changes. Your infrastructure matches the configuration."
```

If the plan wants to **add** resources → an address was missed in B3; check
`legacy-addresses.txt`.
If the plan wants to **destroy** resources → the legacy state still owns
them; the move did not land in foundation's state.
If the plan wants to **replace** a resource → resource address shape differs
between legacy and stack (e.g. nested module path changed). Use `terraform
state mv` again with the corrected new address.

### B6. Repeat B3-B5 for cluster, then platform

Cluster owns: `module.eks` (entire submodule tree).
Platform owns: `module.ingress`, `module.observability`, `module.security`,
`module.slo`, `module.finops`, `module.self_healing`, `module.auth`,
storefront-* modules.

### B7. Archive legacy state

After all three per-stack plans report zero changes:

```bash
aws s3 mv "s3://${BUCKET}/${LEGACY_KEY}" "s3://${BUCKET}/archive/legacy-${ENV}-$(date +%Y%m%d).tfstate"
```

Keep the archived state for at least 30 days as rollback safety.

### B8. Retire legacy break-glass

Remove `LEGACY_ROOT_APPLY=1` gated steps from `.github/workflows/infra.yml`:

```bash
grep -n "LEGACY_ROOT_APPLY" .github/workflows/infra.yml
```

Delete those job steps and the env-var guards. Open a PR; require approval.

---

## Rollback

### During Path A

`terraform destroy` per stack in reverse order: platform → cluster →
foundation. Cheap because resources are recent and no data was persisted yet.

```bash
terraform -chdir=stacks/platform   destroy -var-file=../../terraform.tfvars
terraform -chdir=stacks/cluster    destroy -var-file=../../terraform.tfvars
terraform -chdir=stacks/foundation destroy -var-file=../../terraform.tfvars
```

### During Path B (live env)

If a `state mv` corrupts state or a plan wants to destroy something live:

1. Do NOT apply.
2. Restore the legacy state file:
   ```bash
   aws s3 cp ./migration-backups/legacy-<timestamp>.tfstate "s3://${BUCKET}/${LEGACY_KEY}"
   ```
3. Delete the partial per-stack states:
   ```bash
   aws s3 rm "s3://${BUCKET}/${ENV}/foundation/terraform.tfstate"
   aws s3 rm "s3://${BUCKET}/${ENV}/cluster/terraform.tfstate"
   aws s3 rm "s3://${BUCKET}/${ENV}/platform/terraform.tfstate"
   ```
4. Re-init the legacy root and confirm `terraform plan` reports zero changes.
5. Investigate which address was wrong before retrying.

---

## Acceptance Criteria (closes #16)

- [ ] All three stacks apply cleanly from zero in dev (Path A).
- [ ] Re-plan after apply reports no changes across all three stacks.
- [ ] EKS reachable, ingress serves traffic, observability collects metrics,
      order-api can deploy via existing `app.yml`.
- [ ] (Optional, when staging is reborn) Path B validated against a real
      pre-existing legacy-state environment.
- [ ] `LEGACY_ROOT_APPLY=1` gated steps removed from `.github/workflows/infra.yml`.
- [ ] `stacks/README.md` "Migration runbook validated" checkbox flipped to `[x]`.
- [ ] `BACKLOG.md` updated: the layered-stack migration (A01) moved to Done.

---

## Known Friction Points

1. **Long EKS apply.** Cluster apply takes 10-15 min for control plane + 5
   min for node group. Don't ctrl-C halfway — leaves a half-created cluster
   that has to be force-deleted.
2. **Platform precondition guards.** `stacks/platform/main.tf` has 9
   `precondition` blocks. If a plan fails on a precondition, the message
   tells you which toggle pairs are inconsistent in `terraform.tfvars`.
3. **Kubernetes provider chicken/egg.** Platform stack assumes cluster is
   already up. If you try to plan platform before cluster apply succeeds,
   `terraform_remote_state.cluster.outputs` is empty and the provider falls
   back to `localhost` — same bug the layered split was meant to fix. Always
   apply cluster first.
4. **OTel API key rotation.** First platform apply generates the token.
   Re-apply does not rotate it unless `otel_token_rotation_days` window
   passes or you `-replace=module.observability.random_password.otel_api_key`.
5. **`bash` required for `tf-init.sh` and `terraform-stacks.sh`.** On
   Windows, run from git-bash or WSL. PowerShell will not execute the `.sh`
   files directly.
