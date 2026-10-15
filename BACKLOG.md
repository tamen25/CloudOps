# Backlog

Open work, by priority. IDs are stable: reference them in commits and PRs
(`(S04)`, `Closes P06`). Shipped items move to **Done** with their PR.

The audit behind most of this is `docs/reviews/2026-10-15-platform-audit.md`.
Older backlog history (numbered items) is in `docs/backlog-archive.md`.

## Rules for this file

- One line per item, then indented detail. Say what is wrong and what done
  looks like.
- Nothing is applied to AWS without a cost estimate and an explicit yes.

## P0 — security

- [ ] **S01** — CI could become account admin from any branch.
  Done on GitHub (environments limited to `main`, `production` needs a
  reviewer, `main` ruleset) and in code in #13 (IAM write scoped to the
  project's names, one policy for both bootstrap paths, oidc.sh trust matches
  Terraform). Open: verify on the first apply (AWS phase), and check whether
  a role created by the old oidc.sh still exists with its any-branch trust.
- [ ] **S08** — Permissions boundary on the roles the deployer creates.
  Name-scoped IAM still lets a `<project>-*` role be given broad rights.
  Done when every `aws_iam_role` sets `permissions_boundary` and the deployer
  policy requires it on create.

## P1 — correctness, supply chain, process

- [ ] **S05** — Write-path Lambdas reach beyond the platform: self-healing
  `autoscaling:SetDesiredCapacity`, auto-remediation `rds:ModifyDBInstance`
  and `ec2:RevokeSecurityGroupIngress` on `*`. Add a project-tag condition.
- [ ] **S06** — Secret scanning (gitleaks) in CI.
- [ ] **S07** — The traces libraries propagate B3 only; every service uses W3C
  `traceparent`. Default to W3C trace context and baggage, accept B3 on
  extract.
- [ ] **P03** — The traces libraries are not built, tested or
  coverage-gated in `libraries.yml`.
- [ ] **P04** — The Node traces library pins OpenTelemetry 0.52 / 1.x; the
  services use 0.223 / 2.x.
- [ ] **A01** — Two Terraform layouts (root `main.tf` and `stacks/`) manage
  the same modules. Retire the root layout (ADR, state-migration runbook).
- [ ] **D01** — Review Dependabot's actions bump (#12): 20 updates, some
  majors.

## P2 — quality

- [ ] **C03** — Machine-written boilerplate comments: 340 file headers, 176
  Terraform "Creates the … resource named" lines, 53 restating comments.
  Remove; keep comments that explain why.
- [ ] **P05** — AI tooling named in tracked files: a design export with a
  saved chat (`apps/storefront/design/cloudops-frontend/chats/`) and doc
  mentions. (`.gitignore` entries: done in #8.)
- [ ] **L01** — actionlint: two `if: false` constants in `storefront.yml`
  (use the deploy switch instead), two shellcheck warnings.
- [ ] **R01** — Finish the code review: storefront, loadgen, api-gateway,
  payment, fraud (Java), inventory and projection-worker (Python), the
  traces libraries in depth, the Lambdas.

## P3 — Argus integration (after the above)

- [ ] **I01** — Mimir cardinality analysis on, for Argus's MET-001 backend
  check and cost attribution.
- [ ] **I02** — Chaos Mesh behind an `enable_chaos` toggle, off by default;
  Gatekeeper exemption only while it is on.
- [ ] **I03** — Capacity and cost check for running Argus here, before any
  apply.

## Done

- [x] **S03** — every action pinned to a commit SHA, Dependabot keeps them
  current (#10).
- [x] **S04** — npm advisories: critical `proxy-addr` and all high ones in
  shipped code cleared; OpenTelemetry SDK 0.223 (log export fixed for its new
  API); audit gate with a reviewed, expiring allowlist (#7).
- [x] **P01** — CI ran no AWS-safe path: deploy kill switch
  (`AWS_DEPLOY_ENABLED`) and the 60-commit branch merged after a full CI run
  (#6).
- [x] **P02** — generated Lambda zips untracked; CMake probes ignored (#8).
- [x] **C01, C02** — `go vet` and `terraform fmt` (#9).
- [x] **M01** — scripts were not executable; ledger and pricing had no
  server timeouts and failed the 70% coverage gate (#11).
- [x] **P06** — this file.
