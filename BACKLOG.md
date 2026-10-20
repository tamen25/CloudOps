# Backlog

Open work, by priority. IDs are stable: reference them in commits and PRs
(`(S04)`, `Closes P06`). Shipped items move to **Done** with their PR.

The audit behind most of this is `docs/reviews/2026-10-15-platform-audit.md`.
Older history (numbered items #1–#147) is in `docs/backlog-archive.md`; the
ones still open are carried over below as O-items.

Nothing is applied to AWS without a cost estimate and an explicit yes.

## P1 — correctness, supply chain, process

- [ ] **D02** — cosign-installer v4 installs cosign v3, which signs in the
  new Sigstore bundle format. app.yml pins cosign v2 until one v3-signed
  image is admitted by the policy in enforce mode on a live cluster
  (docs/runbooks/image-signature-policy.md). The archived
  cosign-gatekeeper-provider it was going to be checked against is replaced
  by Sigstore policy-controller (#45).

## P2 — carried over from the old backlog

- [ ] **O01** (#9) — East-west mTLS: decide ADR 030. Assessed: Istio
  ambient (no CNI swap, no sidecars) after the first AWS run, or accept
  the risk (NetworkPolicy and request signatures only) and close.

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
  no `<project>-*` buckets, no load balancers for the cluster, no
  `available` EBS volumes tagged `ebs.csi.aws.com/cluster=true`, no
  `/aws/eks/<cluster>` log group.
- [ ] **V03** — In-VPC runners (docs/runbooks/ci-runner.md): set the fork-PR
  approval setting, register the GitHub App, build the runner image, turn
  on `enable_ci_runner`, run the App Pipeline's deploy on `cloudops-vpc`,
  check the runner NetworkPolicy blocks Postgres, then make the endpoint
  private and run it again.

## Done

- [x] **C01** — CI/CD review (docs/reviews/2026-10-20-cicd-review.md): 19
  findings in the AWS paths of the workflows, fixed across #52–#55; a
  workflow checker and a real-Postgres migration test keep them fixed.

- [x] **O02** (#76) — in-VPC runners: `modules/ci-runner` (ARC 0.14.2, off
  by default, egress DNS/HTTPS only), the runner image and its workflow,
  cluster jobs opt in through `DEPLOY_RUNNER`; ADR 025 accepted. Live check
  is V03.

- [x] **F01** — the storefront pipeline builds, signs, scans and deploys
  (storefront.yml): image to the foundation stack's ECR repository, values
  from the stacks' outputs (scripts/storefront-deploy-env.sh), and a
  shop.<domain> record on the shared ALB (#48).

- [x] **O03** (#138) — response-shape audit checked against the code: one
  row was wrong (traces, now admin-only, F-138-2), mesh endpoints added
  (#47).
- [x] **O04** (#139) — the AWS Budgets hard-cap action exists:
  `modules/finops/budget_action.tf` attaches a deny policy (new instances,
  node groups, clusters, ASGs) to the named roles when actual spend crosses
  the cap; off by default, runbook `security/abuse-response.md` A3 (#47).
- [x] **O05** (#140) — carried over by mistake: closed as moot on
  2026-06-02 (backlog archive) when the upload route was removed. Checked
  again: the storefront has no upload route, presigned URL or multipart
  handler (#47).

- [x] **K01** — kube-bench findings record the node they came from. The
  cluster has one managed node group (one AMI, one launch template), so one
  node per run stands for all; with more groups, one job per group (#46).

- [x] **R02** — review decisions: fraud fails closed, no trust by tenant
  name, projection-worker recovers from throttling, expired iterators and
  reshards, inventory's stock check documented; storefront checkout takes
  a per-attempt Idempotency-Key (SF-7), per-pod limits accepted (SF-8)
  (#44).

- [x] **Q01** — 185 more generated comments; shellcheck clean on every
  script; the fraud image's OTel agent pinned by checksum (#43).

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
