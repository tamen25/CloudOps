# Platform audit — 2026-10-15

Scope: the whole repository at `feature/storefront-and-api-rework` (`6c82c26`),
which is 58+ commits ahead of `main`. Security, process, architecture and code.
No AWS API was called: everything here comes from the code, the local quality
gate, and the GitHub API (read-only).

Status: **in progress.** Sections marked *pending* are not reviewed yet.

## Baseline: the quality gate, run locally

`docs/quality-gate.md` is the repository's quality contract. CI last ran on
2026-05-09 (on `main`, cancelled), so none of it has run against the current
branch. Run locally (no AWS):

| Check | Result |
|---|---|
| `terraform validate` (root, foundation, cluster, platform) | pass |
| tflint | pass |
| kubeconform (`scripts/validate-k8s-manifests.sh`) | pass |
| every Node, Go, Python and Java test suite, with coverage gates | pass |
| `terraform fmt -check` | **fail**: `modules/storefront-checkout/step_functions.tf` |
| tfsec, HIGH and above | **fail**: 37 findings (see S02); the `.tfsec/` suppressions the workflow mentions do not exist |
| `go vet libraries/go/logs` | **fail**: `logger_test.go:107` copies a `sync.Mutex` |
| `npm audit --audit-level=high --omit=dev` | **fail** in 15 packages, critical in 5 (see S04) |
| actionlint | *pending* |
| .NET and C++ libraries | not run (no .NET SDK on this machine) |

## Findings

IDs are stable: reference them in commits and PRs.

### Security

- **S01 — critical. CI can become account admin from any branch.**
  The GitHub Actions OIDC role (`modules/bootstrap/github_oidc.tf`) carries
  the full deployer policy (`iam:*`, `ec2:*`, `kms:*` via `oidc.sh`, … on
  `*`), which is admin in effect: `iam:*` can grant anything. Its trust
  accepts `main` and the environments `dev`, `staging`, `production`, and
  none of those environments has a branch policy or a required reviewer, so a
  workflow on any branch that names one gets the role. `scripts/oidc.sh`
  creates the same role with an even wider trust, `repo:<repo>:*`. `main`
  has no protection. Anyone with write access, or a compromised action in
  any workflow (S03), can take the account.
  *Change needed:* restrict each environment to `main` and require a reviewer
  on `production`; protect `main`; split the role into a plan role (read-only,
  any branch) and an apply role (environment-gated); put a permissions
  boundary on roles the apply role creates; remove the wildcard trust from
  `oidc.sh`, or remove `oidc.sh` in favour of the Terraform bootstrap.
- **S02 — high. The human deployer role is admin with optional MFA.**
  `modules/bootstrap/iam.tf`: `iam:*` and 14 other services on `*`, trusted
  by the account root, MFA only when `require_mfa` is set. tfsec's 37 HIGH
  findings are mostly this policy (`ec2:*` reported 30 times).
  *Change needed:* MFA required by default; a permissions boundary; scope
  `iam:*` to the project's role and policy paths.
- **S03 — high. No action is pinned to a commit SHA.** All 124 `uses:`
  references are tags, 13 of them third-party (Pluralith, anchore, aqua
  tfsec/trivy, docker, hashicorp, infracost, sigstore, tflint). A moved tag
  runs in workflows that hold the S01 role.
  *Change needed:* pin to SHAs with the version as a comment; let Dependabot
  update them.
- **S04 — high. A critical `npm audit` advisory in five services.**
  `proxy-addr` (GHSA-jqcg-44mw-7w3h, IP spoofing through IPv4-mapped IPv6) in
  api-gateway, loadgen, order-api, payment and storefront; HIGH advisories in
  all eight Lambdas and the Node libraries. A non-breaking `npm audit fix`
  clears the critical one.
- **S05 — medium. Write-path Lambdas reach beyond the platform.**
  Self-healing `autoscaling:SetDesiredCapacity` and auto-remediation
  `rds:ModifyDBInstance` and `ec2:RevokeSecurityGroupIngress` on `*`: they can
  change resources in the account that are not this platform's.
  *Change needed:* a project-tag condition (`aws:ResourceTag/Project`).
- **S06 — low. `terraform.tfvars` was committed once** (`6c39547`, 2026-03-28,
  reachable from `main`). Its sensitive fields were empty, so nothing leaked;
  but there is no secret scanning to catch a real one.
  *Change needed:* a secret-scanning gate (gitleaks) in CI.
- **S07 — medium. The new traces libraries propagate B3 only.** Every other
  service uses the OpenTelemetry default, W3C `traceparent`, so a service on
  these libraries would neither continue its callers' traces nor be continued
  by its callees. (Correctness more than security; listed here because it
  breaks the observability the platform relies on.)

### Process

- **P01 — high. CI has not run on the current code.** The pipelines last ran
  on 2026-05-09, on `main`, cancelled; the 58-commit branch was never
  validated by CI. Drift Detection failed every day for weeks (it cannot
  assume its role once the platform is torn down) until GitHub disabled it.
  *Change needed:* open the branch as a PR so every gate runs; make
  Drift Detection skip cleanly when nothing is deployed.
- **P02 — medium. Generated files are tracked.** The finops Lambda zips are
  rebuilt by Terraform's `archive_file` at plan time (and now bundle
  `node_modules`, 4–5 MB each); a CMake system-information folder sits in the
  .NET logs tests.
  *Change needed:* untrack and ignore them.
- **P03 — medium. The traces libraries are not in CI.** `libraries.yml` tests
  and publishes only the logs libraries; the six new traces libraries are
  never built, tested or coverage-gated.
- **P04 — medium. Version drift.** The Node traces library pins OpenTelemetry
  exporter `^0.52`; the five apps were bumped together to `^0.218`.
- **P05 — low. AI tooling is named in tracked files.** `.gitignore` lists
  `CLAUDE.md`, `.dual-graph`, `.gstack`; a design export carries a saved chat
  (`apps/storefront/design/cloudops-frontend/chats/chat1.md`); docs mention
  Claude. The standard is to keep tooling out of tracked files
  (`.git/info/exclude`).
- **P06 — low. No live backlog.** Open work is spread over
  `docs/backlog-archive.md`, `docs/prod-roadmap.md` and backlog numbers in
  commit messages that do not match GitHub PRs (#143–#147 are not PRs).
  *Change needed:* one `BACKLOG.md` with stable IDs, as in Argus.

### Architecture

- **A01 — high. Two Terraform layouts manage the same modules.** The root
  `main.tf` (one state, `-target` choreography) and `stacks/` (three states,
  ADR 011) both provision every module. A change must work in both, and
  nothing stops them from drifting.
  *Change needed:* finish the move to `stacks/` and retire the root layout,
  with an ADR and a state-migration runbook.
- *pending:* module boundaries and the `enable_*` dependency graph; the
  mesh and storefront modules; the observability stack's sizing.

### Code

- **C01 — low. `go vet` fails** in `libraries/go/logs` (a test copies a
  struct holding a `sync.Mutex`).
- **C02 — low. `terraform fmt`** fails on one file.
- *pending:* per-service review of the ten apps and six libraries.
