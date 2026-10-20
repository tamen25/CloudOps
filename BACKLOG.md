# Backlog

Open work, by priority. IDs are stable: reference them in commits and PRs
(`(S04)`, `Closes P06`). Shipped items move to **Done** with their PR.

The audit behind most of this is `docs/reviews/2026-10-15-platform-audit.md`.
Older history (numbered items #1–#147) is in `docs/backlog-archive.md`; the
ones still open are carried over below as O-items.

Nothing is applied to AWS without a cost estimate and an explicit yes.

## P1 — correctness, supply chain, process

- [ ] **D02** — cosign-installer v4 installs cosign v3, which signs in the
  new bundle format. Whether the in-cluster cosign-gatekeeper-provider
  verifies it is unchecked; until then the installer pins cosign v2.
- [ ] **F01** — The storefront pipeline builds and deploys nothing: needs
  the storefront ECR repository, IRSA role and certificate, then build,
  scan and deploy jobs like app.yml's (placeholders removed in #16).
- [ ] **R02** — Decide the open behaviours in the reviews:
  `docs/reviews/2026-10-20-mesh-services-review.md` — fraud fails open
  (R01-6), reservations are neither held nor released (R01-7),
  `synthetic-` tenants are trusted by name (R01-8), projection-worker
  resilience (R01-9); `docs/reviews/2026-10-20-storefront-review.md` — an
  identical cart bought again within 24 h replays the earlier order (SF-7),
  rate limits are per pod (SF-8).
- [ ] **Q01** — shellcheck findings in `scripts/build-and-push.sh` and
  `scripts/validate-k8s-manifests.sh`, and generated comments the C03 rules
  did not cover (workflow headers "This manifest defines …", "Exposes the
  … output value.").
- [ ] **K01** — kube-bench checks the one node its pod lands on. Run it
  per node (a DaemonSet-style job, or one Job per node group) so a
  finding is about a node, not whichever node ran that night.

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

## AWS phase — checks that need a live environment

Everything above the line is code; these are the parts only an apply can
prove. I03 comes first.

- [ ] **I03** — Approve (or change) the estimate before any apply:
  `docs/cost/2026-10-20-argus-run-estimate.md` — ≈ $0.62/hr while running,
  ≈ $4–5 for a 4–6 h session, ≈ $15/day if left up; three t3.large nodes.
- [ ] **S01** — First apply with the scoped deployer policy; check whether
  a role created by the old oidc.sh still exists with its any-branch trust.
- [ ] **S08** — Switch the permissions boundary on and run its runbook's
  verify list (docs/runbooks/security/permissions-boundary.md).
- [ ] **V01** — Run once and read the output of: the kube-bench job (#32;
  eks-1.8.0 on the node mounts), the compliance scanner
  (`DescribeClusterVersions`), the idle detector (Container Insights metric
  and dynamic label), and the SLO deploy gate (finds its metric).
- [ ] **I02** — First Chaos Mesh experiment: check the Falco rules against
  the chaos daemon (docs/runbooks/chaos-mesh.md).
- [ ] **V02** — Run the Destroy workflow once at the end of the first AWS
  session and confirm nothing is left: `plan -destroy` empty per stack,
  no `<project>-*` buckets, no load balancers for the cluster.

## Done

- [x] **F02** — ECR repositories for every image in the foundation stack
  (immutable tags, scan on push, lifecycle), and a working
  `scripts/build-and-push.sh` (#42).

- [x] **A01** — the root Terraform layout retired; the stacks are the only
  one (ADR 028, #38).
- [x] **S09** — the internal request signature is HMAC-SHA256 in all six
  services (ADR 029, #39).
- [x] **R01** — code review complete: storefront (#40), mesh services
  (#35), Lambdas (T01). Open decisions are R02.

- [x] **S11** — the Destroy workflow tears down the layered stacks CI
  deploys; it used to work on the root layout and would have left a stacks
  environment running without state (#36).
- [x] **S10** — kube-bench can run: own namespace, node mounts, pinned
  images, no run-time npm install (#32).
- [x] **R01** (part) — mesh services: projection skipped every record,
  inventory checked repeated SKUs separately, fraud approved malformed
  amounts, no timeouts on any hop (#35).
- [x] **D01** — the 20 Actions updates, with the fixes the majors needed;
  cosign kept on v2 (#31, #34).
- [x] **C03** — 1,418 machine-written comments removed (#17).

- [x] **S01** — deployer and CI IAM scoped to the project's roles,
  policies and buckets; one policy for both bootstrap paths; MFA default
  (#13). Live check under AWS phase.
- [x] **S05** — self-healing resizes only this cluster's node groups (#14).
- [x] **S08** — permissions boundary on every workload role, off by
  default, with a Terraform test (#29). Switch-on under AWS phase.
- [x] **T01** — every Lambda has tests that CI runs (15 packages); they
  found defects in eleven (#23, #30).
- [x] **SC1** — read-only init containers, tracked EKS suppressions; the
  Trivy gates filter by severity again; tfsec authenticates its release
  lookup (#20).
- [x] **L01** — shellcheck findings; jobs that cannot run on a PR removed;
  manifests validated after rendering (#16, #18).
- [x] **I01, I02** — Mimir cardinality analysis on; Chaos Mesh behind a
  switch, its Gatekeeper exemption only while on (#27).
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
- [x] **P06** — this file, and the audit report (#26).
