# Layered Stack Bring-up

Local runbook for bringing up `stacks/foundation` → `stacks/cluster` →
`stacks/platform` in an AWS account. The single root module these replaced
was retired before any environment was built from it (ADR 028), so there is
no state to migrate.

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

If the bucket does not exist yet, create it with
`bash modules/bootstrap/create-s3-bucket.sh`.

---

## Bring-up

### 1. Apply foundation

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

### 2. Apply cluster

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

### 3. Apply platform

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

### 4. Smoke test

```bash
kubectl get nodes
kubectl get pods -A | grep -E 'ingress|observability|gatekeeper|monitoring'
curl -sf "https://otel.${DOMAIN}/v1/metrics" -H "Authorization: Bearer ${TOKEN}" -X POST -d '{}' | jq .
```

### 5. Re-plan sanity check

Re-run plan for each stack. All three must report **no changes**.

```bash
TF_PLAN_DETAILED_EXITCODE=1 ./scripts/terraform-stacks.sh plan
echo "exit=$?"   # must be 0
```

Exit 0 = clean. Exit 2 = drift detected; investigate before declaring success.

---

## Rollback

`terraform destroy` per stack in reverse order: platform → cluster →
foundation. Cheap because resources are recent and no data was persisted yet.

```bash
terraform -chdir=stacks/platform   destroy -var-file=../../terraform.tfvars
terraform -chdir=stacks/cluster    destroy -var-file=../../terraform.tfvars
terraform -chdir=stacks/foundation destroy -var-file=../../terraform.tfvars
```

## Acceptance criteria

- [ ] All three stacks apply cleanly from zero in dev.
- [ ] Re-plan after apply reports no changes across all three stacks.
- [ ] EKS reachable, ingress serves traffic, observability collects metrics,
      order-api can deploy via existing `app.yml`.
- [ ] The Destroy workflow then removes everything (BACKLOG V02).
- [ ] `stacks/README.md` "First full bring-up" checkbox flipped to `[x]`.

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
