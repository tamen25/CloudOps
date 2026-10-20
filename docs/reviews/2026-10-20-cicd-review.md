# CI/CD review — 2026-10-20

Every workflow under `.github/workflows/` was read against the code and
Terraform it calls, looking at the AWS paths (`AWS_DEPLOY_ENABLED`) that
had never run. None of these jobs has run against AWS since; the fixes are
verified by tests, the workflow checker and reading, as each PR says.

## Findings

| # | Workflow | Finding | Fixed in |
|---|---|---|---|
| C1 | app.yml | `deploy` ran kubectl without ever running `aws eks update-kubeconfig`. A kubeconfig step sat in `build-and-push`, which needs none (#51 removed it there, wrongly calling it broken) | #52 |
| C2 | app.yml | setup-terraform's wrapper was on in `deploy` and `integration-test`, so values read with `$(terraform output -raw …)` included its extra lines | #52 |
| C3 | app.yml | The integration test ordered a SKU no migration created; order re-pricing refused it on every fresh database, so the test could never pass | #52 (migration 008) |
| C4 | app.yml | `KINESIS_STREAM_NAME` read a tfvars variable that does not exist; CI deploys never published orders | #52 |
| C5 | app.yml | A promotion skipped `image-scan` and with it the error-budget gate | #52 |
| C6 | app.yml | The ECR repository came from a hand-set secret; the admission policy only admits `<project>/order-api` | #52 |
| C7 | infra.yml | `apply` had no `id-token: write` (the workflow grants `contents: read`): it could never assume the AWS role | #53 |
| C8 | destroy.yml | A private or IP-restricted endpoint refused the hosted runner, so the platform destroy failed | #53 |
| C9 | drift-detection.yml | Plans ran without `-var-file` and without the Lambda build: drift against variable defaults, and every Lambda reported every night | #53 |
| C10 | drift-detection.yml | Drift issues in a public repository carried up to 60 KB of plan attributes | #53 |
| C11 | eks-emergency-access.yml | No dev option; close passed an invalid `publicAccessCidrs=[]`; no wait for the update | #53 |
| C12 | several | Free-text inputs pasted into `run:` scripts (`confirm`, `reason`, `cidr`, `stacks`, `promote_digest`, loadgen's inputs) | #52, #53 |
| C13 | mesh.yml, loadgen.yml | Image build and the dispatched load run were commented-out "activation pending" blocks; loadgen's dispatch only echoed its inputs | #54 |
| C14 | mesh.yml | The npm audit the quality-gate doc lists as a gate ran with `continue-on-error` | #54 |
| C15 | app.yml | The quality-gate doc lists `tsc` in the test job; the job never built | #54 |
| C16 | app.yml, validate-k8s-manifests.sh | kubeconform validated against Kubernetes 1.32; the cluster default is 1.35 | #52 |
| C17 | observability module | No default StorageClass: EKS 1.30+ creates clusters without one, and Loki's write/backend and Mimir's alertmanager claims name none, so they stay Pending and the platform apply times out. `gp3` is now the default | #55 |
| C18 | destroy.yml | Claims in the Helm-created namespaces (mimir, loki, tempo) survived the platform destroy; their EBS volumes would outlive the cluster. Destroy now deletes the claims while the CSI driver runs and waits for the volumes | #55 |
| C19 | destroy.yml | EKS's control-plane log group (created by EKS, never expiring) stayed after the cluster; destroy now deletes it | #55 |

Open, not fixed: destroy empties the data buckets before the platform
stack is destroyed, while Loki and Mimir still write. With
`buckets_force_destroy = true` (the dev default) Terraform deletes the
objects anyway. With `false`, as prod sets it, a bucket refilled in that
window refuses deletion and the destroy stops there.

## What keeps them fixed

- `scripts/check-workflows.py` (Workflow Lint, on any workflow change):
  OIDC permission, Terraform wrapper off, kubeconfig before kubectl, no
  inputs pasted into scripts, stack plans with `-var-file`. It reported 11
  problems before #53 and 0 after; each fix was reverted once to see it
  fail.
- `apps/order-api/test/migrations-postgres.test.ts` applies the migrations
  to a real Postgres in CI and checks the integration-test fixture.

## Not covered

- No workflow has run against AWS. The first runs to watch: the Destroy
  workflow at the end of the next AWS session (V02), then an App Pipeline
  deploy with `AWS_DEPLOY_ENABLED` on.
- The loadgen run clones the trickle CronJob with `kubectl create job
  --from`; the override was tested on a Job of the same shape, not against
  a cluster.
