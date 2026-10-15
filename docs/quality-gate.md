# Static Quality Gate

Backlog #70 source of truth. Every PR runs the same set of checks below
without SonarQube/SonarCloud — they are the entire static quality contract
for this repo.

## Gate matrix

| Layer | Tool | Workflow / job | Fails on |
|-------|------|----------------|----------|
| Terraform format | `terraform fmt -check -recursive` | `infra.yml` quality | unformatted file |
| Terraform validate | `terraform validate` (root + every layered stack) | `infra.yml` quality | schema/expression error |
| Terraform lint | `tflint --recursive --config="$(pwd)/.tflint.hcl" --minimum-failure-severity=error` | `infra.yml` quality | tflint error |
| Workflow lint | `actionlint 1.7.4` | `infra.yml` quality | invalid action input, shellcheck violation in `run:` |
| IaC security | `aquasecurity/tfsec-action@v1.0.3` (`--minimum-severity HIGH`, `soft_fail: false`) | `infra.yml` quality | HIGH/CRITICAL tfsec finding |
| Secret scan | `gitleaks` over the full history (`.gitleaksignore` for reviewed false positives) | `secrets.yml` | any finding not in `.gitleaksignore` |
| Image scan | `trivy@0.28.0` (HIGH/CRITICAL) | `app.yml` build-and-push | unsuppressed vulnerable layer |
| Manifest schema | `kubeconform v0.6.7 -strict -kubernetes-version 1.32.0` | `app.yml` manifest-validation, `scripts/validate-k8s-manifests.sh` | invalid manifest |
| Node lint | `eslint src test scripts` (flat config) | `app.yml` test, `libraries.yml` nodejs-check | error-level rule |
| TypeScript build | `tsc` | `app.yml` test (`npm run build`) | type or import error |
| Node audit | `npm run audit` → `scripts/npm-audit-gate.mjs` | `app.yml` test, `mesh.yml`, `storefront.yml` | HIGH/CRITICAL advisory not in `.github/npm-audit-allowlist.json`, or an allowlist entry past its `until` date |
| Lambda lockfiles | `npm ci --omit=dev` per Lambda dir | `infra.yml` quality | missing/stale `package-lock.json` |
| order-api tests | `npm test` (node:test) + `npm run test:coverage` gate | `app.yml` test | test failure or coverage below threshold (`docs/coverage-gates.md`) |
| Library tests | per-language test runner + coverage gate | `libraries.yml` per language | test failure or coverage below threshold |
| Contract check | `npm run contract-check` (env-var drift app↔manifest) | `app.yml` test | missing env var in `deployment.yaml` |
| API contract | `npm run openapi:lint` (Spectral against `apps/order-api/openapi.yaml`) | `app.yml` test | OpenAPI syntax error or `error`-severity lint rule |

## PR vs. push behavior

PR runs:

- Static checks above: all of them.
- AWS-touching jobs (`build-and-push`, `image-scan`, `budget-check`, `deploy`,
  `integration-test`): SKIPPED (closes backlog #25).
- `plan-pr` runs Terraform validate without AWS credentials or production
  tfvars (closes backlog #48).

Push to `main` and `workflow_dispatch` runs the full pipeline including
deploy paths, **but only when the repository variable `AWS_DEPLOY_ENABLED`
is `true`.** Every job that assumes the AWS role (build-and-push, image
scan, budget check, deploy, integration test, Terraform plan/apply,
compliance scan, library publishing, drift detection) checks it first and
is skipped otherwise, so the static checks keep running on `main` while
nothing touches the account. Set it when the platform is deployed:

```bash
gh variable set AWS_DEPLOY_ENABLED --body true   # deploy paths on
gh variable delete AWS_DEPLOY_ENABLED            # off again
```

The manual workflows (Destroy, EKS Emergency Access) are not gated: a
human starts them, and tearing down must work when deploys are off.

## Authoritative answers when something fails

- A scanner flagged a finding? Either fix the code or add an explicit tracked
  suppression (`# trivy:ignore:...`, `.tfsec/config.yml` exclude,
  `.checkov.yml` skip-check). Never disable the gate.
  For npm advisories with no fixed release, add the GHSA id to
  `.github/npm-audit-allowlist.json` with the reason it cannot be reached and
  an `until` date; the gate fails again once that date passes.
- Coverage dropped below a threshold? Add tests; do not lower the threshold
  without an explanation in the commit message + a matching update to
  `docs/coverage-gates.md`.
- A lint rule is too noisy? Discuss in PR. The bias is to keep the rule on.

This page + `docs/coverage-gates.md` together are the no-Sonar quality
contract.
