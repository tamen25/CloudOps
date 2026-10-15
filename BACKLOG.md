# Backlog

Open work, by priority. IDs are stable: reference them in commits and PRs
(`(S04)`, `Closes P06`). Shipped items move to **Done** with their PR.

The audit behind most of this is `docs/reviews/2026-10-15-platform-audit.md`.
Older history (numbered items #1–#147) is in `docs/backlog-archive.md`; the
ones still open are carried over below as O-items.

Nothing is applied to AWS without a cost estimate and an explicit yes.

## P0 — security

- [ ] **S01** — CI could become account admin from any branch. Done on
  GitHub (environments limited to `main`, `production` needs a reviewer,
  `main` ruleset) and in code (#13: IAM and S3 write scoped to the
  project's names, one policy for both bootstrap paths, oidc.sh trust
  matches Terraform).
  Open: verify on the first apply (AWS phase), and check whether a role
  created by the old oidc.sh still exists with its any-branch trust.
- [ ] **S08** — Permissions boundary on the roles the deployer creates.
  Name-scoped IAM still lets a `<project>-*` role be given broad rights.
  In code behind a switch (#25, stacked on #13); open: switch it on and
  verify in the AWS phase (docs/runbooks/security/permissions-boundary.md).

## P1 — correctness, supply chain, process

- [ ] **A01** — Two Terraform layouts (root `main.tf` and `stacks/`) manage
  the same modules. Retire the root layout (ADR, state-migration runbook).
  Includes old #16 (layered-stack runbook not validated on a live env).
- [ ] **T01** — 13 Lambdas had no tests. The three write paths
  (self-healing, scale-in, auto-remediation) are covered, with four bugs
  fixed (#23); 10 remain. Unit tests with the AWS SDK stubbed; dry-run
  behaviour covered.
- [ ] **D01** — Review Dependabot's actions bump (#12): 20 updates, some
  majors.
- [ ] **F01** — The storefront pipeline builds and deploys nothing: needs
  the storefront ECR repository, IRSA role and certificate, then build,
  scan and deploy jobs like app.yml's (placeholders removed in #16).
- [ ] **R01** — Finish the code review: storefront, loadgen, api-gateway,
  payment, fraud (Java), inventory and projection-worker (Python), the
  Lambdas.

## P2 — carried over from the old backlog

- [ ] **O01** (#9) — Service mesh mTLS east-west (Cilium) is missing.
- [ ] **O02** (#76) — Self-hosted runners in the VPC (ARC on EKS): module,
  runner image and workflow migration not built (ADR 025).
- [ ] **O03** (#138) — JSON response-shape audit for PII and internal
  tokens. Verify against `docs/security/response-shape-audit.md`; close if
  that covers it.
- [ ] **O04** (#139) — AWS Budgets hard-cap action. Verify: `c6aee6a`
  added a budget hard cap; close if it is the action this asked for.
- [ ] **O05** (#140) — CSAM/NCMEC hash scan on the storefront upload
  pipeline.

## P3 — Argus integration (after the above)

- [ ] **I01** — Mimir cardinality analysis on, for Argus's MET-001 backend
  check and cost attribution.
- [ ] **I02** — Chaos Mesh behind an `enable_chaos` toggle, off by default;
  Gatekeeper exemption only while it is on.
- [ ] **I03** — Capacity and cost check for running Argus here, before any
  apply.

## In review

- **S01** — IAM and S3 write scoped to the project; MFA default (#13).
- **S08** — permissions boundary, off by default (#25).
- **S05** — self-healing resizes only this cluster's node groups (#14).
- **T01** (part) — tests for the three write-path Lambdas, four fixes (#23).
- **C03** — 1,419 machine-written comments removed (#17).
- **L01** — shellcheck findings; jobs that cannot run on a PR removed;
  manifests validated after rendering (#16 merged, #18).
- **SC1** — Trivy config findings: read-only init containers, tracked EKS
  suppressions; the Trivy gates filter by severity again (SARIF output had
  turned the filter off) and tfsec authenticates its release lookup (#20).

## Done

- [x] **S03** — every action pinned to a commit SHA, Dependabot keeps them
  current (#10).
- [x] **S04** — npm advisories: critical `proxy-addr` and all high ones in
  shipped code cleared; OpenTelemetry SDK 0.223 (log export fixed for its new
  API); audit gate with a reviewed, expiring allowlist (#7).
- [x] **S07, P03** — traces libraries propagate W3C trace context with B3 as
  fallback, in all six languages; CI builds, tests and coverage-gates them
  (#19).
- [x] **P01** — deploy kill switch (`AWS_DEPLOY_ENABLED`); the 60-commit
  branch merged after a full CI run (#6).
- [x] **P02** — generated Lambda zips untracked; CMake probes ignored (#8).
- [x] **C01, C02** — `go vet` and `terraform fmt` (#9).
- [x] **M01** — scripts not executable; ledger and pricing without server
  timeouts and under the coverage gate (#11).
- [x] **S06** — gitleaks over the whole history (#15).
- [x] **P04** — Node traces library on OpenTelemetry 2.x; exporter key no
  longer logged (#21).
- [x] **P05** — no AI tooling in tracked files; specs to docs/design (#22).
- [x] **P06** — this file.
