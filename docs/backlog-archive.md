# Backlog Archive — Resolved Work and Historical Change Log

Snapshot of CLAUDE.md sections describing completed work as of 2026-05-14.
Source of truth for completed work is git history + closed PRs; this file
exists as a searchable index of resolved backlog IDs (#1 … #94) and the
2026-04-21 → 2026-04-27 platform-hardening narrative.

Agents: do NOT load this for context unless the user references a specific
historical row by ID. CLAUDE.md is the live operating guide.

---

## Current State

**Project mode**: single AWS account, dev/test platform that gets torn down
overnight to save money. Not yet a multi-tenant or multi-account product.

**What stays up overnight** *(last verified 2026-04-23)*:
- `module.bootstrap` — OIDC provider, GitHub Actions IAM role, ECR pull-through cache, S3 state bucket
- `module.dns` — Route 53 hosted zone for the project domain (zone ID + name come from your local tfvars; not recorded here)

**What gets rebuilt on next pipeline run**: EKS, networking, ingress, observability, security, database, self_healing, slo, finops.

**Pipeline order (staged applies in `.github/workflows/infra.yml`)**:
bootstrap + networking + dns → EKS → ingress → observability → security → database → self_healing/slo/finops → final sync.

**Kubernetes provider guard**: `var.enable_eks && (var.enable_ingress || var.enable_observability)`. Disabling ingress + observability while leaving EKS on falls back to `localhost`.

**ECR pull-through prefix**: `ecr-public`. Every `public.ecr.aws/...` image must resolve through `<account>.dkr.ecr.<region>.amazonaws.com/ecr-public/...` because nodes have no NAT.

**Grafana sidecar labels**:
- `grafana_dashboard=1` — dashboards
- `grafana_alert=1` — alert rules / contact points / policies
- `grafana_datasource=1` — extra datasources

**App env-var contract**: every `process.env.X` in `apps/order-api/src/` must also exist in `apps/order-api/k8s/deployment.yaml`. Enforced by `apps/order-api/scripts/contract-check.js` in the CI `test` job.

**Backend**: partial S3 config. `terraform init` always goes through `./scripts/tf-init.sh`, which reads `bootstrap_bucket_name` from `terraform.tfvars` and passes `-backend-config="bucket=..."`.

---

## Do Not Break (agent guardrails)

These are tripwires from past incidents. Don't undo them without an explicit ask.

1. **Do not re-ignore `.terraform.lock.hcl`.** It's intentionally tracked so CI and local plans resolve identical provider versions. Regenerate only via `terraform init -upgrade`.
2. **Do not commit `terraform.tfvars`.** Template is `terraform.tfvars.example`. `git rm --cached` was applied once; the file is gitignored. Local edits stay local.
3. **Do not bypass the ECR pull-through cache for public images.** Nodes have no NAT — direct `public.ecr.aws/...` references will hang on `ImagePullBackOff`.
4. **Do not pass `-var enable_ingress=false`/`enable_observability=false`/`enable_security=false` to normal `terraform plan` or `apply`.** It triggers the kubernetes provider's `localhost` fallback (see provider guard). Only acceptable inside specific import steps that don't touch k8s resources.
5. **Do not amend or force-push commits that have already been pushed.** Create new commits.
6. **Do not change the S3 backend bucket in `provider.tf`.** It's deliberately a partial config. Per-fork bucket names go through `scripts/tf-init.sh`.
7. **Caveman mode is the default tone.** Drop articles, filler, pleasantries. Keep technical terms exact. Code blocks normal. Git commits + PR descriptions normal.
8. **Minimal output.** No end-of-turn summaries, no todo recaps, no "what I did" lists. State what changed in one line. User reads diffs.
9. **Do NOT read `PROJECT_EXPLAINER.md`.** It is a human-maintained interview-prep narrative, git-ignored, and not part of the codebase. Only touch it when the user explicitly asks ("update PROJECT_EXPLAINER.md ..."). Never load it for context, never grep it, never reference its content when answering questions.

---

## Workflows

Pre-built multi-plugin workflows in `.claude/workflows/`:

### 🎨 Frontend Fix
**Trigger**: "frontend fix" or "storefront fix"

**Pipeline**: Security Guidance → Code Review → Frontend Design → Superpowers → Verification

**Current priorities**:
- S1 (P1): Guest cart UUID collision check
- S2 (P1): JWT verification on static assets
- S3 (P2): Checkout cart hash race condition

### 🔒 Security Review
**Trigger**: "security review" or "security audit"

**Pipeline**: Security Guidance (threat model) → Code Review (patterns) → Superpowers (batch fixes) → Report → Backlog update

**Outputs**: Score /100, findings by severity, compliance gaps

### 📝 Code Review
**Trigger**: "code review" or "review code"

**Pipeline**: Code Review (comprehensive) → Security Guidance (security focus) → Frontend Design (if storefront) → Report → Backlog update

**Outputs**: Score /100, findings by category, file:line refs

### ⚡ Bulk Refactor
**Trigger**: "bulk refactor", "batch fix", or "superpowers fix"

**Pipeline**: Code Review (scope) → Superpowers (multi-file changes) → Verification → Git operations

**Common targets**:
- A1: Convert 11 test files CommonJS → ESM
- M1: Change 6 SQL files `--` → `/* */`
- C1: Fix 3 workflow hardcoded ARNs
- I5: Extend OIDC trust policy

See [`.claude/workflows/`](./.claude/workflows/) for detailed steps.


---

## Known Risks / Follow-ups (backlog)

Status: `open` / `in-progress` / `resolved` / `wont-fix`. Priority: `P1`-`P4`.

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 1 | resolved | P3 | EKS `access_config` drift | Resolved 2026-04-27: `modules/eks/cluster.tf` now declares `access_config { authentication_mode = "API_AND_CONFIG_MAP", bootstrap_cluster_creator_admin_permissions = true }`. Future applies should report no diff. |
| 2 | wont-fix | P4 | Gatekeeper image-signature regex still references `var.github_repo` at TF time | Marked wont-fix 2026-04-27. Policy is functional with the current TF-time interpolation; rewriting it to read from a runtime ConfigMap adds a Gatekeeper sync dependency without solving a real problem today. Revisit only if `github_repo` becomes runtime-derived (IRSA / dynamic provider). |
| 3 | resolved | P3 | No Grafana-native alert rule examples shipped | Resolved 2026-04-27: `modules/observability/grafana_native_alerts.tf` ships three rules (Loki error-log spike, HTTP 5xx surge, request-volume drop) as a single ConfigMap labelled `grafana_alert=1`. CloudWatch-sourced rules (RDS CPU credits, ALB metrics) remain a follow-up — they need a Grafana CloudWatch datasource + IRSA, deferred for scope. |
| 4 | resolved | P2 | `Alertmanager` was off until recently | Resolved 2026-04-27: `scripts/verify-alerting.sh` checks the AM pod, SLO PrometheusRule CRDs, and (optionally) the Grafana ruler API for the cloudops-native rule UIDs. Run after each apply. |
| 10 | resolved | P2 | Separate state per env | Resolved 2026-04-27: `provider.tf` backend `key` is now partial. `scripts/tf-init.sh` derives the key as `<environment>/terraform.tfstate` from `terraform.tfvars`. Override with `STATE_KEY=...`. Existing single-state users migrate with `STATE_KEY=dev/terraform.tfstate scripts/tf-init.sh -migrate-state`. |
| 11 | resolved | P3 | SAR rotation Lambda not auto-deployed | Resolved 2026-04-27: `modules/database/rotation_lambda.tf` deploys the SAR app `SecretsManagerRDSPostgreSQLRotationSingleUser` via `aws_serverlessapplicationrepository_cloudformation_stack` when `database_rotation_lambda_auto_deploy = true` and `database_rotation_lambda_arn = ""`. Caller path (explicit ARN) still works. |
| 12 | resolved | P3 | WAF data lookup may race ALB creation | Resolved 2026-04-27: `data.aws_lb.public` and `aws_wafv2_web_acl_association.alb` in `modules/ingress/waf.tf` now `depends_on = [helm_release.lb_controller]`, and the two-pass marker (`alb_dns_name != ""` count guard) is documented inline. First pass: WAF created, association skipped, LBC creates ALB. Second pass: lookup resolves, association attaches. |
| 5 | resolved | P3 | Docs/runbooks `${DOMAIN}` placeholders are literal text | Resolved 2026-04-27: workflow steps that emit dashboard URLs in the GitHub step summary now read `domain_name` from `secrets.TF_VARS` at the top of the step, defaulting to `example.com`. Touched: `infra.yml` compliance-scan step, `app.yml` budget-check + security-posture-check steps. |
| 6 | resolved | P4 | `bootstrap_bucket_name` still must match between `terraform.tfvars` and the actual S3 bucket | Resolved 2026-04-27: `scripts/tf-init.sh` now calls `aws s3api head-bucket` before `terraform init`. If the bucket does not exist in the current account/region, init aborts with a clear error. Skip with `SKIP_BUCKET_CHECK=1` on first deploy where the bucket is about to be created by `module.bootstrap`. |
| 13 | wont-fix | P3 | Grafana CloudWatch datasource + IRSA for CW-sourced alerts | Superseded by #14 (yace). Direct CW datasource means Grafana hits CW API on every dashboard load + every alert eval ($$ + slow). yace scrapes CW into Prom on interval, then everything queries Prom uniformly. |
| 14 | resolved | P2 | `yace` (Yet Another CloudWatch Exporter) → Prometheus | Resolved 2026-04-27: `modules/observability/yace.tf` deploys yace via helm in `monitoring` namespace with IRSA (`cloudwatch:GetMetricData`, `tag:GetResources`, `cloudwatch:ListMetrics`). Scrapes AWS/RDS, AWS/ApplicationELB, AWS/NATGateway, AWS/Lambda. ServiceMonitor labelled `release: prometheus` so kube-prometheus-stack picks it up. Ships PrometheusRule `cloudwatch-yace-alerts` with RDS CPU credits / free storage and ALB 5xx / unhealthy-host alerts. Activate with `enable_yace = true`. |
| 15 | resolved | P3 | `PROJECT_EXPLAINER.md` — interview-prep narrative | Resolved 2026-04-27: created at repo root, added to `.gitignore`, "Do Not Break" guardrail #9 added. Plain-English explainer covering architecture, tech-choice rationale, 17 design decisions/tradeoffs, cost model, prod-gap analysis, interview Q&A cheat sheet, and glossary. Updated only on explicit user prompt — agents must NOT read it for context. |
| 19 | resolved | P2 | Story: enforce module dependency rules in code | Resolved 2026-05-02: `terraform_data.toggle_guard` in `main.tf` declares `precondition` blocks for every cross-module flag dependency (ingress→eks, observability→eks+ingress, security→eks+observability, slo→observability OR `slo_prometheus_url`, self_healing→eks+observability, yace/alertmanager→observability, external_secrets→eks, backup→database, waf→ingress, plus self-healing ALB-suffix pairing, rotation lambda + bucket replication consistency). `terraform plan` now fails with a named error before apply when any combination is invalid. |
| 21 | resolved | P2 | Story: move DB migrations out of app startup | Resolved 2026-05-02: new `apps/order-api/src/migrate.js` standalone entrypoint runs `runMigrations()` under a Postgres session-level advisory lock (key `0x4f524445/0x52415049` exposed as `LOCK_KEY_HIGH/LOCK_KEY_LOW`). `apps/order-api/k8s/migration-job.yaml` runs the migrator as a Kubernetes Job named `order-api-migrate-<IMAGE_TAG>` reusing the order-api ServiceAccount/IRSA, with `ttlSecondsAfterFinished=600` for cleanup. `app.yml` deploy job applies the Job, `kubectl wait --for=condition=complete --timeout=300s`, then proceeds to rollout. `server.js` no longer imports `runMigrations` — it only does `SELECT 1` to verify connectivity. Concurrent migrators block on `pg_advisory_lock`; lock auto-releases on session end if a migrator crashes. Tests: `apps/order-api/test/migrations.test.js` covers acquire/release and exception-path release. |
| 22 | resolved | P1 | Story: fail closed on auth and scope secret access | Resolved 2026-05-02: new `apps/order-api/src/auth-config.js` exports `assertAuthConfigured({ apiKey, nodeEnv, logger })`. `server.js` calls it after resolving the API key — booting in `staging`/`prod` (anything outside `{dev,test,local}`) throws when neither `API_KEY` nor `API_KEY_SECRET_ARN` is set. IRSA scoping: new `var.order_api_secret_arns` on `modules/eks` (and root local `order_api_secret_arns` built from the deterministic `${name_prefix}-db-credentials-*` ARN pattern + optional `var.order_api_api_key_secret_arn`) replaces the wildcard Resource on the order-api role. ESO scoping: new `var.external_secrets_allowed_arns` on root + security module narrows `secretsmanager:GetSecretValue/DescribeSecret` to an explicit ARN list (ListSecrets stays `*` because the API does not support resource-scoping). Tests: `apps/order-api/test/auth-config.test.js` covers dev/test/local warn-only, staging/prod throw, and apiKey-set silent paths. |
| 20 | resolved | P2 | Story: remove build/provision side effects from Terraform apply | Resolved 2026-05-02: new `scripts/build-lambdas.sh` runs `npm install --omit=dev` for every Lambda dir before TF runs. Every `null_resource.<name>_build` + `local-exec "npm install"` in `modules/{slo,finops,self_healing,security}/*.tf` is removed; `data.archive_file.*` blocks remain (zipping is deterministic). Each `aws_lambda_function` now has a `lifecycle.precondition` checking `node_modules/.package-lock.json` exists, failing plan with a clear message pointing to the build script. `infra.yml` quality + plan + apply jobs each run the script as a step before `terraform`. Grafana token: `null_resource.grafana_service_account` no longer rotates the token on every apply (trigger replaced with fixed `rotation_marker = "v1"`); the provisioner now deletes every existing token on the `cloudops-lambda-reader` service account before creating a new one, so applies cannot silently accumulate tokens in Grafana. To force rotation: `terraform apply -replace=module.observability.null_resource.grafana_service_account`. `.gitignore` adds `node_modules/` patterns under `modules/**/lambda_function*/`. |
| 17 | resolved | P1 | Story: make ALB / DNS / WAF ownership explicit | Resolved 2026-05-02: chose the **two-ALB model** — public `cloudops` ALB shared by order-api + Grafana (HTTPS, WAF-protected) and a separate `cloudops-otel` ALB for the OTel gRPC traceport. order-api ingress now carries `alb.ingress.kubernetes.io/group.name = cloudops` + `group.order = 30` + `ssl-redirect = 443` so it lands on the same ALB as Grafana. New root vars `otel_alb_dns_name` + `otel_alb_zone_id` flow through `module.ingress` (also new `otel_subdomain`, default `otel`); `modules/ingress/route53.tf` adds an `aws_route53_record.otel` alias gated on `otel_alb_dns_name != ""`. WAF stays scoped to the `cloudops` ALB lookup (intentional — gRPC L7 inspection is out of scope). New `outputs.tf` output `otel_url` returns `https://otel.${domain}` once the cloudops-otel ALB is up. |
| 18 | resolved | P1 | Story: make app deployment owned by one system | Resolved 2026-05-02: `.github/workflows/infra.yml` "Deploy sample app" step deleted — infra now provisions only platform prerequisites (cluster, IRSA, ACM, DNS, observability, security, database, OTel). `.github/workflows/app.yml` is the sole owner of build/sign/scan/render/migrate/apply/rollout/integration-test/rollback. Image references are now digest-pinned (`<repo>@sha256:<digest>`): `build-and-push` job exposes `image_digest` as a job output, `deploy` job adds `IMAGE_REF` env from `needs.build-and-push.outputs.image_digest`, signature verification + manifest render + rollout + summary all use `IMAGE_REF`. Mutable `:latest` tag no longer published from `build-and-push`. Gatekeeper `K8sNoLatestTag` already permits `<repo>@sha256:` references (allows when image contains `:` or `@`). |
| 16 | in-progress | P1 | Story: split Terraform into layered states | CI normal path now plans/applies `stacks/foundation` -> `stacks/cluster` -> `stacks/platform` via `scripts/terraform-stacks.sh`; app workflow reads outputs from stack states. Legacy root `-target` steps are gated behind `LEGACY_ROOT_APPLY=1` for break-glass migration recovery only. Remaining: validate the migration runbook against a real environment before marking resolved. |
| 23 | resolved | P1 | Workflow toolchain versions are stale / inconsistent | Resolved 2026-05-02: `destroy.yml` and `drift-detection.yml` `TF_VERSION` bumped from `1.7.0` to `1.11.0` (matches `infra.yml`/`app.yml`). `infra.yml` quality job now runs `actionlint 1.7.4` after tflint and before tfsec; verified clean against the full `.github/workflows` set. |
| 24 | resolved | P1 | Destroy workflow environment input is not wired to state/tfvars | Resolved 2026-05-02: `.github/workflows/destroy.yml` "Write terraform.tfvars" step now picks `secrets.TF_VARS_<ENV>` first (via `secrets[format('TF_VARS_{0}', inputs.environment)]`) and falls back to `secrets.TF_VARS`; aborts when neither exists. New "Assert tfvars environment matches input" step greps `^environment` out of the written tfvars and fails the run when it disagrees with `inputs.environment`. State-key derivation (`scripts/tf-init.sh`) still pulls from the same tfvars `environment` field, so the assertion guarantees destroys target the correct state file. |
| 25 | resolved | P2 | App pipeline lacks a PR gate | Resolved 2026-05-02: `.github/workflows/app.yml` adds a `pull_request` trigger covering `apps/order-api/**` and the workflow file itself. `test` + `manifest-validation` run on PRs; AWS-touching jobs (`build-and-push`, `image-scan`, `budget-check`, `deploy`, `integration-test`) gate on `if: github.event_name != 'pull_request'`. PR runs validate code without ever pushing images, hitting CloudWatch, or touching the cluster. Push-trigger paths also extended to include `.github/workflows/app.yml`. |
| 26 | resolved | P1 | NetworkPolicy enforcement is ambiguous and ALB allow rules may be wrong | Resolved 2026-05-02: chose **AWS VPC CNI network-policy mode** over Cilium to avoid a CNI swap. `modules/eks/addons.tf` `aws_eks_addon.vpc_cni` now sets `configuration_values = jsonencode({ enableNetworkPolicy = "true" })`, which switches on the eBPF-based per-node enforcer (CNI v1.14+). ALB allow rules rewritten: with `target-type: ip` the ALB writes packets directly to pod IPs sourced from the ALB ENIs, so source matching needs an `ipBlock`, not a `kube-system` namespaceSelector. Updated `modules/security/network_policies.tf` (`order_api` ingress :3000 now uses `ip_block { cidr = var.vpc_cidr }`) and `apps/order-api/k8s/networkpolicy.yaml` (`order-api-allow-http` uses `ipBlock: ${VPC_CIDR}`). New `VPC_CIDR` render template var threaded through the manifest-validation step (default `10.0.0.0/16`) and the deploy step (read from `terraform.tfvars`). Port 9090 (Prom scrapes) keeps the monitoring namespaceSelector — that's true pod-to-pod traffic. |
| 27 | resolved | P2 | `order_api_namespace` is not consistently honored | Resolved 2026-05-02: replaced hardcoded `"cloudops"` app-namespace references with `var.application_namespace` in `modules/security/network_policies.tf` (order_api NetworkPolicy metadata + every `kubernetes.io/metadata.name` selector), `modules/security/gatekeeper_policies.tf` (`K8sRequiredResources` namespaces), `modules/security/falco_rules.tf` (Falco rule conditions for shell + outbound), and `modules/self_healing/alarms.tf` (CloudWatch Container Insights `Namespace` dimension on the order-api error-rate alarm). Variable defaults stay `cloudops`. Dashboard JSON / Grafana folder / WAF ALB group / CloudWatch namespace literals untouched (those reference brand/CW-namespace strings, not K8s namespaces). |
| 28 | resolved | P2 | Toggle guards miss base infrastructure dependencies | Resolved 2026-05-02: extended `terraform_data.toggle_guard` in `main.tf` with two preconditions: (1) `enable_eks=true` with `enable_networking=false` now requires non-empty `existing_vpc_id` + `existing_private_subnet_ids` + `existing_public_subnet_ids` + `existing_node_sg_id`; (2) `enable_database=true` requires `enable_networking=true` today (DB subnet group + SG come from the networking module — bring-your-own networking for RDS would need module-level vars first). Both fail plan with actionable messages. |
| 29 | resolved | P2 | Supply-chain reproducibility gaps | Resolved 2026-05-02: (1) `package-lock.json` generated and committed for all 8 Lambda dirs (`modules/{slo,finops/{cost_ingestion,idle_detector},self_healing/{lambda_function,lambda_function_scale_in},security/{auto_remediation,compliance_scanner,kube_bench_processor}}`); `scripts/build-lambdas.sh` now prefers `npm ci --omit=dev` when a lockfile is present, falls back to `npm install` only if missing. (2) AWS Load Balancer Controller Helm chart pinned to `version = "1.8.4"` in `modules/ingress/lb_controller.tf`. (3) RDS rotation SAR app pinned via new `var.rotation_sar_semantic_version` in `modules/database/variables.tf` (default `1.1.656`, latest at pin time); `modules/database/rotation_lambda.tf` uses the var instead of `null`. |
| 30 | resolved | P3 | Line-ending churn in working tree | Resolved 2026-05-03: ran `git add --renormalize .` against the clean tree after committing the auth/tenancy/hardening batch (`b98a615`). 0 files staged — the index already matches what `.gitattributes`' `eol=lf` would produce. The `w/crlf` reported by `git ls-files --eol` is core.autocrlf converting on checkout, not an index discrepancy. No follow-up needed. |
| 31 | resolved | P3 | TFLint warning cleanup | Resolved 2026-05-03: root `.tflint.hcl` already disables `terraform_required_providers`; the recursive run was bypassing it. Fix: pass `--config="$(pwd)/.tflint.hcl"` to `tflint --recursive` (updated `.github/workflows/infra.yml` and the CLAUDE.md validation block). Cleaned the remaining 4 real warnings: added `terraform { required_version = ">= 1.5.0" }` to `modules/dns/main.tf`; removed unused `environment` from `modules/backup/variables.tf` (and its root call) plus unused `environment` and `region` from `modules/compliance/variables.tf` (and its root call). `tflint --recursive --config=… --minimum-failure-severity=error` now exits 0 with 0 warnings. |
| 32 | resolved | P1 | Fix NetworkPolicy RDS egress when `db_subnet_cidrs = null` | Resolved 2026-05-03: `modules/networking/outputs.tf` now exposes `db_subnet_cidrs`, `public_subnet_cidrs`, and `private_subnet_cidrs` (the effective values — caller input or `cidrsubnet`-generated). `main.tf` security module call now passes `module.networking[0].db_subnet_cidrs` when networking is on, falling back to `var.db_subnet_cidrs ?? []` only on bring-your-own networking. The order-api egress rule on TCP 5432 to RDS now emits with real CIDRs even when root `db_subnet_cidrs = null`, so the migration Job + app pods can reach Postgres after VPC CNI NetworkPolicy enforcement (#26) is enabled. |
| 33 | resolved | P2 | Make app PR `notify` job report skipped deploys correctly | Resolved 2026-05-03: `.github/workflows/app.yml` `notify` job now branches on `github.event_name`. PR runs read `needs.test.result` + `needs.manifest-validation.result` and emit a PR-shaped summary ("✅ PR Validation Passed" / "❌ PR Validation Failed"). Push/dispatch runs keep the existing deploy summary. `notify` `needs:` extended to include `test` + `manifest-validation` so the PR branch has results to read. |
| 34 | resolved | P2 | Include generated Lambda lockfiles in the current change batch | Resolved 2026-05-03: verified all 8 lockfiles exist on disk (`modules/{slo,finops/{cost_ingestion,idle_detector},self_healing/{lambda_function,lambda_function_scale_in},security/{auto_remediation,compliance_scanner,kube_bench_processor}}/package-lock.json`) and that `git check-ignore` returns non-zero for each — `.gitignore` only excludes `node_modules/`, never the locks. They are tracked-by-default and will land in the next commit alongside `scripts/build-lambdas.sh`, so `npm ci --omit=dev` becomes the active path. |
| 35 | resolved | P3 | Restore local Kubernetes manifest validation tools | Resolved 2026-05-03: new `scripts/validate-k8s-manifests.sh` renders `apps/order-api/k8s` with placeholder env vars (including `VPC_CIDR`) into a temp dir and runs `kubeconform -strict -kubernetes-version 1.32.0 -ignore-missing-schemas -summary` against the result. The script auto-downloads kubeconform v0.6.7 (Linux/macOS/Windows) into `.tools/` on first run; `.gitignore` excludes `.tools/`. Verified locally: 11 valid resources, 0 invalid. CLAUDE.md "Kubernetes manifests" validation block now points at the new script. Replaces the old `kubeval` reference (kubeval is unmaintained; kubeconform is the active fork). |
| 36 | resolved | P1 | Add explicit pod security contexts so Gatekeeper admits order-api | Resolved 2026-05-03: pod-level `securityContext { runAsNonRoot: true, runAsUser: 1001, runAsGroup: 1001, fsGroup: 1001, seccompProfile: { type: RuntimeDefault } }` added to `apps/order-api/k8s/deployment.yaml` and `apps/order-api/k8s/migration-job.yaml`. UID 1001 matches the `nodejs` user created by the Dockerfile. Container-level `securityContext { allowPrivilegeEscalation: false, capabilities: { drop: ["ALL"] } }` added to both. Render verified — Gatekeeper `K8sNoRootContainers` rule now admits both Pod templates (matches `c.securityContext.runAsUser > 0` AND pod-level `spec.securityContext.runAsNonRoot == true`). |
| 37 | resolved | P1 | Tighten secret access and GitHub/Terraform secret coupling | Resolved 2026-05-03: (1) `modules/eks/irsa.tf` order-api policy + `modules/security/external_secrets.tf` ESO policy now have `lifecycle.precondition` blocks that fail plan when `order_api_secret_arns` / `external_secrets_allowed_arns` is empty in `environment != "dev"`. The `*` fallback survives only as a dev bootstrap convenience. (2) New root output `order_api_api_key_secret_arn` exposes the Terraform-managed ARN. (3) `.github/workflows/app.yml` deploy step now asserts in non-dev/test/local envs that `secrets.ORDER_API_KEY_SECRET_ARN` matches `terraform output -raw order_api_api_key_secret_arn`, failing the run on drift or empty TF output. (4) `environments/staging.tfvars.example` documents `external_secrets_allowed_arns` + `order_api_api_key_secret_arn` placeholders so staging cannot accidentally apply with wildcard ESO permissions. |
| 38 | resolved | P1 | Harden public OpenTelemetry ingestion before production | Resolved 2026-05-03: 4 new root vars surface OTel ingestion controls (`otel_ingestion_internal`, `otel_allowed_cidrs`, `otel_rate_limit_per_5min`, `otel_token_rotation_days`) and flow through `module.observability`. (1) `modules/observability/otel_collector.tf` ALB scheme is now `internal` when `otel_ingestion_internal=true` (production default). (2) New `modules/observability/otel_waf.tf` provisions a regional WAFv2 web ACL specifically for the `cloudops-otel` ALB — default-deny + IPSet allow-list when `otel_allowed_cidrs` is set, default-allow + per-IP rate limit when only `otel_rate_limit_per_5min > 0`. ALB association uses the same two-pass marker pattern as the cloudops WAF (`var.otel_alb_dns_name != ""`). (3) `modules/observability/secrets.tf` `random_password.otel_api_key` now carries a `keepers` block that rotates the token at `otel_token_rotation_days` windows; the SM secret + k8s `otel-auth` Secret pick up the new value automatically. (4) `environments/prod.tfvars.example` ships with `otel_ingestion_internal=true`, rate limit 60k/5min, 30d token rotation. Tenant-aware tokens deferred to #8 (multi-tenant DB lands first). |
| 39 | resolved | P2 | Make IaC and security scans hard gates with pinned supply chain | Resolved 2026-05-03: every scanner now runs at a pinned version and HIGH/CRITICAL findings hard-fail. Changes: `infra.yml` quality job — `aquasecurity/tfsec-action@v1.0.3` with `soft_fail: false` + `--minimum-severity HIGH`; `aquasecurity/trivy-action@0.28.0` (was `@master`) with `continue-on-error` removed; `pip install checkov==3.2.298` and `checkov ... --check HIGH,CRITICAL` (was `\|\| true`). `app.yml` build-and-push — Trivy bumped to `@0.28.0`; Syft now installed via `anchore/sbom-action/download-syft@v0.17.7` (was curl-piped install.sh on `main`); Grype via `anchore/scan-action/download-grype@v5.2.1`; `sigstore/cosign-installer` pinned to `@v3.7.0`. `app.yml` manifest-validation — kubeval (unmaintained) replaced with pinned kubeconform v0.6.7 download. `actionlint 1.7.4` clean. To suppress an intentional finding now: a tracked `# trivy:ignore:...` comment, a `.tfsec/config.yml` exclude, or a `.checkov.yml` skip-check entry — never a CI flag flip. |
| 40 | resolved | P2 | Add a true production launch profile | Resolved 2026-05-03: rewrote `environments/prod.tfvars.example` as a complete launch profile (vs the previous 44-line stub). Every WAF / audit-detection / backup / retention / endpoint control is ON by default; every staging destroy-safety shortcut is flipped back to its safe-for-customers value (`database_deletion_protection=true`, `skip_final_snapshot=false`, `buckets_force_destroy=false`, `cloudtrail_object_lock_enabled=true`, `backup_vault_lock_enabled=true`, `database_secret_recovery_window_days=30`, `eks_endpoint_public_access=false`). Bucket retention `expiration_days=0` (never expire), backup retention scaled for SOX/SOC 2 (daily 35, weekly 90, monthly ~7yr), CloudTrail object-locked 365d. Secret-scoping placeholders documented (#37) so the file fails plan if launched without explicit ARNs. Header documents the intentional teardown friction (no var-file flip can destroy prod). |
| 41 | resolved | P2 | Reduce database logging exposure before customer data | Resolved 2026-05-03: `modules/database/parameter_group.tf` parameter values are now driven by 5 new module vars (`log_connections`, `log_disconnections`, `log_duration`, `log_statement`, `log_min_duration_statement_ms`). Defaults stay dev-friendly (log everything). Root surfaces `database_log_*` vars (with the same defaults) and threads them into `module.database`. `environments/staging.tfvars.example` documents the production policy: `log_statement="ddl"`, `log_duration=false`, `log_min_duration_statement_ms=500` — captures slow queries + schema changes without leaking customer DML payloads. Validation block enforces `log_statement ∈ {none, ddl, mod, all}`. |
| 42 | resolved | P2 | Restrict production EKS public endpoint access | Resolved 2026-05-03: `modules/eks/cluster.tf` `vpc_config` now reads `endpoint_private_access`, `endpoint_public_access`, and `public_access_cidrs` from new module vars (defaults preserve dev behavior). Root surfaces `eks_endpoint_private_access` / `eks_endpoint_public_access` / `eks_endpoint_public_access_cidrs` and threads them through. `environments/staging.tfvars.example` documents the production policy: `eks_endpoint_public_access = false` (reach API via private runners / VPN / bastion); the CIDR list is kept as a documented escape hatch with a "tighten before flipping public access on" note. |
| 43 | resolved | P2 | Add SaaS compliance and monetization launch checklist | Resolved 2026-05-03: new `docs/saas-launch-checklist.md` is a starter checklist (NOT legal advice — must be reviewed with qualified counsel/accounting for target market). Sections: legal documents (ToS / Privacy Policy / DPA / MSA / incident-response policy / trust page), privacy (GDPR / CCPA / HIPAA & COPPA & MSB exclusions / data residency / sub-processor list), money/tax (sales tax + VAT registration, refund policy, pricing-page disclosures), identity (real auth #7 + multi-tenant isolation #8 + MFA + audit log), operations (status page, IR runbook, backup drill, DR plan, insurance), compliance roadmap (SOC 2 / ISO 27001 / HIPAA / PCI / FedRAMP — only when a specific customer requires). Sign-off table at bottom for tracking. |
| 44 | resolved | P3 | Add request validation and product data boundaries | Resolved 2026-05-03: `apps/order-api/src/app.js` adds a hand-rolled `validateOrderPayload()` (no schema-runtime dep) that POST `/order` runs before any DB call. Rules: items array length 1–50; each item `{ sku: string 1–64, quantity: integer 1–999 }`; total finite number 0–1,000,000 with ≤2 decimals (IEEE-754 tolerance baked in). `express.json({ limit: "64kb" })` caps body size. Failures return `400 invalid_request` with a `detail` reason. Existing tests updated to send valid payloads; new `apps/order-api/test/order-validation.test.js` (7 cases) covers empty array, missing keys, fractional quantity, total cap, decimal precision, oversize body, and a valid happy path. Integration test in `app.yml` POST body switched to `{"items":[{"sku":"test","quantity":1}],"total":9.99}`. |
| 45 | resolved | P3 | Set SaaS-grade rate limits and abuse controls | Resolved 2026-05-03: `apps/order-api/src/app.js` now runs a two-tier `express-rate-limit` chain on `/order` + `/orders`. Tier 1 (`unauthLimiter`) keys by client IP at twice the configured budget — runs BEFORE auth so credential-stuffing / token-brute-force attempts hit a cheap shield. Tier 2 (`dataLimiter`) keys by `tenant:<id>` (preferred) ?? `user:<sub>` ?? `ip:<addr>` and runs AFTER auth + tenant resolution, so a noisy tenant cannot starve others sharing an egress IP. New test in `apps/order-api/test/multitenancy.test.js` confirms: 3 requests from tenant `acme` get 201/201/429, while tenant `globex` from the same source IP still gets 201 (independent bucket). 35/35 tests pass; lint clean. |
| 7 | resolved | P1 | Real app auth (Cognito / OIDC) | Resolved 2026-05-03: new `apps/order-api/src/auth-jwt.js` exports `createJwtVerifier({ issuer, audience, jwksUrl, requiredScopes, logger })`. Uses `jose` v5 (`createRemoteJWKSet` for cached JWKS lookup + `jwtVerify` for offline verification). `app.js` accepts `jwtVerifier` and runs it before `requireApiKey`: a valid Bearer token sets `req.user` and bypasses the API-key check; a missing token falls through to API-key; an invalid token short-circuits with 401; a token missing required scopes returns 403. `server.js` reads `OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URL`/`OIDC_REQUIRED_SCOPES` from env and builds the verifier when all three core values are set. `auth-config.js` extended (#22 → #7) — non-dev envs accept either `apiKey` OR a JWT verifier. `deployment.yaml` adds the four OIDC env vars (`${OIDC_*}` template values, empty defaults). `app.yml` deploy step reads `secrets.OIDC_*` and threads them through; manifest-validation step renders with empty placeholders. Tests: `apps/order-api/test/auth-jwt.test.js` (6 cases) stands up an in-process JWKS HTTP server with a generated RSA keypair and verifies happy path, wrong-key rejection, wrong-issuer rejection, missing-scope 403, expired-token rejection, and Bearer-fallthrough → API-key path. `auth-config.test.js` extended with a JWT-verifier acceptance case. 29/29 tests pass; lint clean. |
| 8 | resolved | P1 | Multi-tenant DB schema | Resolved 2026-05-03: new migration `apps/order-api/migrations/002_multitenancy.sql` adds `tenant_id VARCHAR(64) NOT NULL` to `orders`, backfills existing rows with `default`, drops the default so future inserts are explicit, creates a `(tenant_id, created_at DESC)` composite index for the per-tenant listing query, and adds a CHECK constraint enforcing `^[a-zA-Z0-9_-]{1,64}$`. App enforcement: `apps/order-api/src/app.js` adds a `requireTenant` middleware that resolves tenant from (1) `req.user.tenant_id` JWT claim, (2) `X-Tenant-Id` header on the API-key path, or (3) `default` fallback in `dev/test/local`. POST `/order` writes `tenant_id` to the new column; GET `/orders` filters by `WHERE tenant_id = $1`. Tests: `apps/order-api/test/multitenancy.test.js` (4 cases) covers tenant persistence, cross-tenant isolation, malformed-header rejection, and the dev-fallback path; `auth-jwt.test.js` extended with a "valid JWT without tenant_id is rejected 400" case. Integration tests in `app.yml` add `-H "X-Tenant-Id: integration-test"` so they work in non-dev envs. RLS deferred — RDS master user owns the table and bypasses RLS by default; activating it safely needs a separate app role wired into the connection pool. Documented as follow-up. 34/34 tests pass. |
| 9 | open | P2 | Service mesh (Cilium recommended) | mTLS service-to-service still missing. NetworkPolicies are L4 only. |
| 46 | resolved | P1 | Story: define prod-equivalent environment contract | Resolved 2026-05-04: `docs/environment-contract.md` now defines dev/staging/prod identity, required parity, and allowed cost-saving differences. `environments/prod-test.tfvars.example` was renamed to `environments/staging.tfvars.example` and now uses `environment = "staging"` so disposable prod-shaped tests cannot collide with real prod state keys in a shared backend. |
| 47 | resolved | P1 | Story: make workflows environment-aware | Resolved 2026-05-04: `infra.yml`, `app.yml`, and `drift-detection.yml` now accept a `workflow_dispatch.environment` choice (`dev` / `staging` / `prod`, with `prod` mapped to GitHub environment `production`). Deploy-capable jobs bind to the selected GitHub environment so environment-scoped AWS/secrets can differ by target. New `scripts/write-ci-tfvars.sh` selects `TF_VARS_DEV` / `TF_VARS_STAGING` / `TF_VARS_PROD` (or environment-scoped `TF_VARS`) and fails when the tfvars `environment` value does not match the selected target. |
| 48 | resolved | P1 | Story: remove deploy-grade AWS role access from PR contexts | Resolved 2026-05-04: `modules/bootstrap/github_oidc.tf` deploy role trust no longer accepts `feature/*` or `pull_request` subjects; it allows protected `main` plus GitHub environment subjects (`dev`, `staging`, `production`). `infra.yml` no longer grants workflow-wide `id-token: write`; AWS OIDC is job-scoped to non-PR plan/apply/compliance paths. PR cost/diagram no longer configure AWS credentials, and a new `plan-pr` job runs with no AWS credentials or production tfvars, using `terraform.tfvars.example` + `terraform init -backend=false`. |
| 49 | resolved | P1 | Story: create cheap prod-shaped dev/staging profile | Resolved 2026-05-05: `environments/dev.tfvars.example` rewritten as a prod-shaped profile — every module behavior toggle (`enable_eks/networking/database/ingress/observability/security/self_healing/slo/finops/external_secrets`) is on, exercising the same deploy/auth/migrate/rollout/integration/rollback path as staging+prod. Cost-saving differences match `docs/environment-contract.md`: smallest compute, no NAT, single replicas, 24h Prom retention, no Mimir/Thanos, audit/backup/WAF/Alertmanager/yace OFF, all destroy locks OFF, public EKS endpoint ON (deferred to #52). Staging already prod-shaped via the #46 rename. |
| 50 | resolved | P1 | Story: wire real OIDC in dev/staging/prod | Resolved 2026-05-05: `apps/order-api/src/auth-config.js` UNAUTHENTICATED_ENVS reduced to `{test, local}` — dev now fails closed without auth (`auth-config.test.js` updated to assert dev throws). Integration test step in `.github/workflows/app.yml` adds OAuth2 client_credentials path: when `OIDC_TOKEN_URL` + `OIDC_CLIENT_ID` + `OIDC_CLIENT_SECRET` are set, fetches an access token and prefers `Authorization: Bearer` over `X-Api-Key`; falls through to API key when only that is configured; fails closed when neither path resolves. New required secrets per env: `OIDC_TOKEN_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` (in addition to the existing `OIDC_ISSUER`/`OIDC_AUDIENCE`/`OIDC_JWKS_URL`/`OIDC_REQUIRED_SCOPES`). 35/35 tests pass. |
| 51 | resolved | P1 | Story: enforce DB-level tenant isolation | Resolved 2026-05-05: new migration `apps/order-api/migrations/003_rls.sql` creates a `order_api_app` group role, enables `ENABLE` + `FORCE ROW LEVEL SECURITY` on `orders`, and adds policy `tenant_isolation` that requires `current_setting('app.tenant_id')` to match `tenant_id` for both `USING` (reads) and `WITH CHECK` (writes). FORCE means even the table owner (the RDS master in dev) cannot bypass — only Postgres superusers can, and the RDS master is not a superuser. New `withTenant(tenantId, fn)` helper in `app.js` checks out a client, opens a transaction, calls `set_config('app.tenant_id', $1, true)`, runs the query, commits — or rolls back on error and always releases. POST `/order` and GET `/orders` now go through `withTenant`. App-side `WHERE tenant_id` clauses kept as defence in depth. New `apps/order-api/test/rls.test.js` (2 cases) verifies BEGIN → set_config → query → COMMIT ordering and ROLLBACK-on-error. 37/37 tests pass. |
| 52 | resolved | P1 | Story: make private EKS endpoint deployable from CI | Resolved 2026-05-05: new `.github/workflows/eks-emergency-access.yml` provides a break-glass path that widens `endpointPublicAccess` to a single caller CIDR via the AWS API (not Terraform — state stays private-only so the next regular apply re-asserts safety). Workflow is gated by the `production` GitHub environment approval when `environment=prod`. Inputs: `environment`, `action=open\|close`, `cidr` (required for open, validated as IPv4 CIDR), `reason` (required, captured in run summary). New `docs/private-eks-access.md` documents three strategies (self-hosted runners in VPC — recommended long-term; SSM bastion — operator-only; emergency CIDR — break-glass), when to use each, and the audit-trail policy. Self-hosted-runner Terraform module deferred as a follow-up. |
| 53 | resolved | P1 | Story: actually use KMS for Terraform state | Resolved 2026-05-05: new `modules/bootstrap/state_bucket_sse.tf` adds `aws_s3_bucket_server_side_encryption_configuration` that flips the existing state bucket from AES256 → SSE-KMS on first apply when `bootstrap_create_kms = true`, using the bootstrap KMS key + `bucket_key_enabled = true` (cuts KMS request volume). `scripts/tf-init.sh` now resolves `alias/<project>-tfstate-kms` via `aws kms describe-key` and passes `-backend-config="kms_key_id=<arn>"` when the alias exists; falls back silently when it does not (bootstrap-from-scratch case). Override with `TF_STATE_KMS_KEY_ID=<arn>`. Pre-existing state objects stay AES256-encrypted on disk until the next write — migration note in the resource header documents the optional `aws s3 cp --metadata-directive REPLACE --sse aws:kms` re-encrypt step. Works for root + every layered stack because all of them share the same bucket. |
| 54 | resolved | P1 | Story: add app deployment approval and image promotion | Resolved 2026-05-05: app deploy already binds to the `production` GitHub environment when `inputs.environment=prod` (approval gate is configured in repo settings). Added `promote_digest` workflow_dispatch input — when set to a `sha256:<64-hex>` digest, the `build-and-push`, `image-scan`, and `budget-check` jobs are skipped and the deploy job uses the supplied digest as `IMAGE_REF`. New "Validate promotion input" step in deploy fails the run on a malformed digest. Cosign signature verification still runs against the promoted digest, so a digest cannot be promoted that was not signed by this workflow. Deploy `if:` rewritten to allow build-and-push being `skipped` (promotion) while still blocking on real failures. |
| 55 | resolved | P2 | Fix integration-test API key extraction | Resolved 2026-05-04: `.github/workflows/app.yml` integration tests now fail closed when `ORDER_API_KEY_SECRET_ARN` is unset or resolves to an empty key. Secret parsing no longer pipes into a heredoc; it passes `SecretString` through `RAW_SECRET` to `python3 -c`, so JSON/plaintext parsing reads the real AWS value instead of the Python script body. |
| 56 | resolved | P2 | Complete admission enforcement | Resolved 2026-05-05: (1) `K8sRequireImageSignature` ConstraintTemplate + Constraint in `modules/security/gatekeeper_policies.tf` are now gated by new var `enable_image_signature_constraint` (default false). With no Cosign provider deployed, the constraint would have raised a `system_error` violation on every Pod admission and bricked the cluster — default-off avoids that. New companion var `enable_cosign_provider` (default false) reserves the toggle for future Cosign Gatekeeper provider deployment. Operators turn both on after applying the upstream sigstore manifests; Cosign signature verification still happens at deploy time via `cosign verify` in `app.yml`. (2) `apps/order-api/k8s/deployment.yaml` and `migration-job.yaml` containers now set `readOnlyRootFilesystem: true` with a writable `/tmp` emptyDir for libraries that need scratch (pino transports, AWS SDK temp files). 11/11 kubeconform-valid resources. |
| 57 | resolved | P2 | Force TLS for RDS connections | Resolved 2026-05-05: `modules/database/parameter_group.tf` adds `rds.force_ssl=1` so RDS refuses plaintext connections at the server. `apps/order-api/src/server.js` and `migrate.js` now configure `pg.Pool` with `ssl: { rejectUnauthorized: true, ca: <bundle> }` in every deployed env (`test`/`local` skip TLS for the unit-test path; `DB_SSL_DISABLED=true` is the explicit escape hatch). New `fetch-rds-ca` initContainer in both `deployment.yaml` and `migration-job.yaml` pulls the AWS-published RDS global CA bundle from `https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem` into a shared `emptyDir` volume mounted at `/etc/rds`; `DB_SSL_CA_BUNDLE` env var points pg at it. CA fetch needs no IAM and no in-tree image. 37/37 tests still pass. |
| 58 | resolved | P2 | Make NetworkPolicy default-deny behavior prod-like | Resolved 2026-05-05: (1) `apps/order-api/k8s/networkpolicy.yaml` now ships a `order-api-default-deny-egress` policy plus a tightly-scoped `order-api-allow-egress` allow list (DNS to kube-system 53, RDS 5432 to VPC, AWS APIs 443 to anywhere, OTel 4317/4318 to monitoring namespace). Egress regressions in dev surface before prod instead of being masked by the previous "egress unrestricted" comment. (2) `modules/security/network_policies.tf` `otel_collector_ingress` (port 4318) and `grafana_ingress` (port 3000) replaced their `0.0.0.0/0` ip_block with `var.vpc_cidr`. With ALB target-type=ip the policy enforcer sees the ALB ENI IP (in-VPC), not the internet client, so the narrower CIDR has identical effective surface and shrinks lateral-movement risk. 13/13 kubeconform-valid resources. |
| 59 | resolved | P2 | Make drift detection per-env and per-stack | Resolved 2026-05-05: `.github/workflows/drift-detection.yml` rewritten to a 2-job model. New `plan-matrix` job emits the env list (full set on schedule, single env on dispatch). `detect-drift` matrix expands `{environment} × {foundation, cluster, platform}` and runs `terraform plan -detailed-exitcode` per cell with `STACK=<stack> ./scripts/tf-init.sh` and `terraform -chdir=stacks/<stack> plan`. Drift issues are scoped per env+stack via three labels (`drift`, `drift-<env>`, `drift-<stack>`) so a dev-only drift no longer comments on the prod issue. Step summary now shows `<env> / <stack>` in the heading. `fail-fast: false` keeps one cell failing from cancelling the others. |
| 60 | resolved | P3 | Refresh roadmap/backlog status after prod-parity work | Resolved 2026-05-05: `docs/prod-roadmap.md` header now declares CLAUDE.md as the canonical day-to-day backlog and points roadmap items to their CLAUDE.md ID + resolution. New "What landed since the original snapshot" section maps roadmap IDs (A/D/E/K/N/O) to CLAUDE.md backlog rows that closed them, and explicitly flags the items still open (#9 Cilium, #56 cosign provider follow-up, K-4 Karpenter, N-4 Transit Gateway). |
| 61 | resolved | P2 | Story: publish OTel ingestion config to SSM Parameter Store | Resolved 2026-05-05: new `modules/observability/ssm_otel_config.tf` provisions SSM parameters under `/<name_prefix>/<environment>/otel/*`: base endpoint host, full `/v1/metrics`, `/v1/traces`, `/v1/logs` URLs (String), and the bearer token (SecureString, encrypted with `alias/aws/ssm` by default — pass `var.ssm_kms_key_id` for a CMK). Token rotates with the existing `random_password.otel_api_key.keepers` from #38. Two new module vars (`publish_otel_ssm_config`, `ssm_kms_key_id`) plumb through root `main.tf`/`variables.tf` and `stacks/platform/main.tf`/`variables.tf`; defaults stay off so no parameters are created until producers exist. Producer IAM (`ssm:GetParameter*` + `kms:Decrypt`) documented inline in the resource header. Root `terraform validate` clean. |
| 62 | resolved | P3 | Story: reduce root-folder clutter without breaking repo entrypoints | Resolved 2026-05-05: `git mv` shifted `deploy.sh`, `destroy.sh`, `oidc.sh` from repo root to `scripts/`. Each script now resolves its own `REPO_ROOT` via `BASH_SOURCE` and `cd`s back to the root before reading `terraform.tfvars` / running `terraform`, so caller cwd is irrelevant. References updated in `README.md`, `apps/order-api/README.md`, `docs/runbooks/master-runbook.md`, and `.github/workflows/infra.yml` comments. `bash -n` clean for all three. `terraform validate` clean at root. Per the story scope boundary, root TF entrypoints (`main.tf`, `variables.tf`, `outputs.tf`, `provider.tf`, `.terraform.lock.hcl`, `terraform.tfvars.example`) stay in place until #16 retires the legacy root. `PROJECT_EXPLAINER.md` references untouched per guardrail #9; private/case-study refs untouched (gitignored). |
| 63 | resolved | P1 | Pod Security Standards `restricted` profile via admission | Resolved 2026-05-05: `apps/order-api/k8s/namespace.yaml` carries the in-tree PSA labels `pod-security.kubernetes.io/{enforce,audit,warn}: restricted` (with matching `*-version: latest`). Deployment + migration-job pods already satisfied restricted from prior backlog work — `runAsNonRoot=true`, non-zero UID/GID 1001, `allowPrivilegeEscalation=false`, `capabilities.drop=[ALL]`, `readOnlyRootFilesystem=true`, `seccompProfile=RuntimeDefault`. `fetch-rds-ca` initContainer carries the same securityContext so it admits under restricted. Closes roadmap K-8. 13/13 kubeconform-valid resources. |
| 64 | resolved | P3 | Story: Convert order-api App From JS To TS | Resolved 2026-05-05: every file under `apps/order-api/{src,test,scripts}` converted from `.js` to `.ts`. New `tsconfig.json` (CommonJS output, target ES2022, rootDir=src, outDir=dist). New devDeps: `typescript`, `@types/node`, `@types/express`, `@types/pg`, `@typescript-eslint/{parser,eslint-plugin}`, `tsx`. Scripts: `build` runs `tsc`, `start` runs `node dist/server.js`, `test` runs `tsx --test test/*.test.ts`, `dev` runs `tsx watch`, `migrate` runs `node dist/migrate.js`, `contract-check` runs via tsx. ESLint flat config switched to `@typescript-eslint/parser` for `.ts` matchers. Dockerfile is now 3 stages: builder (npm ci + tsc), prod-deps (npm ci --omit=dev), runtime (non-root, copies `dist/` + prod node_modules). `migration-job.yaml` runs `node dist/migrate.js`. `app.yml` manifest-validation + deploy jobs install order-api deps then call `apps/order-api/node_modules/.bin/tsx scripts/render-k8s.ts`; `scripts/validate-k8s-manifests.sh` and `scripts/deploy.sh` updated to the same invocation. `.gitignore` excludes `apps/order-api/dist/`. 37/37 tests pass; lint clean; build clean; manifests 13/13 valid; contract-check passes. |
| 65 | resolved | P2 | Story: make coverage source-of-truth per package | Resolved 2026-05-08: new `docs/coverage-gates.md` is the single matrix listing every package's coverage command, scope, exclusions, and per-metric thresholds (order-api 100/85/90; Node 68/60/75; Python 70; Go 75; Java 40; .NET 40; C++ 50). |
| 66 | resolved | P3 | Story: upload coverage reports as CI artifacts | Resolved 2026-05-08: `.github/workflows/libraries.yml` adds `actions/upload-artifact@v4` (`if: always()`, 14-day retention) after every coverage step — `coverage-{nodejs,java,dotnet,python,go,cpp}-logs`. Each artifact bundles the language's text summary plus HTML/XML report (cobertura, jacoco site, gcovr html, go cover -html). Failed coverage gates now leave downloadable evidence in the Actions UI. |
| 67 | resolved | P2 | Story: raise order-api beyond line coverage | Resolved 2026-05-08: `apps/order-api/package.json` `test:coverage` now gates `--test-coverage-lines=100 --test-coverage-branches=85 --test-coverage-functions=90`. Local: 100/89.02/93.51, 49/49 tests pass. Bootstrap entrypoints (`server.ts`, `migrate.ts`, `tracing.ts`) remain explicitly excluded. |
| 68 | resolved | P2 | Story: lift Node/Python/Go library coverage gates | Resolved 2026-05-08: thresholds raised + edge-path tests added. Node `libraries/nodejs/logs`: 60 → 68/60/75; 3 new tests cover sampler probabilistic path, no-op `exportLogs`, fallback paths in `parseStringArray`. Local: 69/65/77, 7/7 pass. Go `libraries/go/logs`: 65 → 75; 3 new tests exercise level methods, stringify variants, sampler trace-ID rotation; `-coverpkg=github.com/cloudops/otel-logs` excludes example code. Local: 81.8%. Python: workflow `--fail-under=70` documented as floor; current 71%. |
| 70 | resolved | P3 | Story: make non-Sonar static quality gate explicit | Resolved 2026-05-08: new `docs/quality-gate.md` lists every static check + threshold the repo enforces — `terraform fmt`, `terraform validate` (root + 3 stacks), `tflint`, `actionlint 1.7.4`, `tfsec@v1.0.3 HIGH+`, `trivy@0.28.0 HIGH+`, `kubeconform v0.6.7 -strict`, ESLint flat config, `tsc`, `npm audit --audit-level=high`, contract-check, language-native tests + coverage gates from `docs/coverage-gates.md`. PR vs push behavior documented. |
| 71 | resolved | P2 | Story: clean up TypeScript migration references | Resolved 2026-05-09: swept stale `.js` references in `apps/order-api/README.md` (banner, dev workflow, render-k8s example, tracing module path) and inline comments in `test/order-validation.test.ts`, `test/auth-config.test.ts`, `src/migrate.ts`, `migrations/001_initial.sql` to point at `.ts`/`tsx`/`dist/*`. Compiled-output references (`dist/server.js`, `dist/migrate.js`) and Node.js runtime descriptors left alone — those are correct. |
| 72 | resolved | P2 | Story: add idempotency keys for `POST /order` | Resolved 2026-05-09: new migration `apps/order-api/migrations/004_idempotency_keys.sql` adds tenant-scoped `order_idempotency_keys` table with FORCED RLS. `apps/order-api/src/app.ts` accepts an optional `Idempotency-Key` header (regex `^[\x21-\x7e]{1,255}$`), hashes the validated payload, and uses `INSERT ... ON CONFLICT DO NOTHING` + `SELECT ... FOR UPDATE` to fence concurrent retries. Same key + same payload replays the stored 201 response; same key + different payload returns 409 `idempotency_conflict`. 24h replay window. Tests: `apps/order-api/test/idempotency.test.ts` (6 cases) covers first-create, exact replay, conflicting-payload 409, cross-tenant isolation, malformed header rejection, hash stability. 59/59 tests pass; 100/91/94 coverage on app.ts; OpenAPI spec updated with `Idempotency-Key` parameter and 409 response. See ADR-015 for design rationale. |
| 73 | resolved | P2 | Story: add order-api audit log table | Resolved 2026-05-09: new migration `apps/order-api/migrations/005_audit_events.sql` adds tenant-scoped `audit_events` table with FORCED RLS, BIGSERIAL PK, indexes on `(tenant_id, created_at DESC)`, `(action, created_at DESC)`, partial on `resource_id`. `apps/order-api/src/app.ts` writes a success audit event (`order.create`, status 201) inside the same `withTenant` transaction as the order INSERT so commit/rollback is atomic; failures write a best-effort `order.create.failed` event in a fresh tenant transaction after rollback. Captures tenant, actor (JWT `sub`/`client_id` or NULL on API-key path), action, `X-Request-Id`, resource_id (order_id), status_code, result, error_code, and metadata (total + item_count). Tests: `apps/order-api/test/audit.test.ts` covers success path inside the same tx and failure path after rollback. Master runbook updated with `audit_events` query examples. |
| 74 | resolved | P3 | Story: commit OpenAPI spec and Spectral lint | Resolved 2026-05-09: new `apps/order-api/openapi.yaml` (OpenAPI 3.0.3) covers `/`, `/health`, `/ready`, `/order`, `/orders` with bearer + apiKey auth schemes, `X-Tenant-Id` and `Idempotency-Key` parameters, full request/response schemas, and every error shape (validation, auth, size, rate-limit, idempotency conflict, server). New `apps/order-api/.spectral.yaml` (extends `spectral:oas`) escalates `operation-operationId`, `operation-operationId-unique`, `operation-success-response` to error. New `npm run openapi:lint` script using `@stoplight/spectral-cli` 6.14.x. CI: `.github/workflows/app.yml` test job runs `openapi:lint` after contract-check. `docs/quality-gate.md` adds API contract row. README links `openapi.yaml`. |
| 75 | resolved | P2 | Story: decide RDS Proxy adoption | Resolved 2026-05-09: deferred — see `docs/adr/014-rds-proxy-defer.md`. ADR documents the four explicit triggers (≥10 replicas steady-state, sustained `DatabaseConnections > 80%` alarms, failover-induced 5xx >5min, customer-driven IAM-auth requirement) under which we adopt. Until any trigger fires, direct `pg.Pool` stays. |
| 77 | resolved | P3 | Story: write ADR batch for recent decisions | Resolved 2026-05-09: added 5 ADRs and indexed them in `README.md`. ADR-011 layered Terraform state (foundation/cluster/platform; rejects Terragrunt). ADR-012 AWS VPC CNI network policy now, Cilium service mesh deferred to #9 (CNI swap blast radius too large for the current week). ADR-013 private EKS endpoint with emergency CIDR break-glass — interim until #76. ADR-014 defer RDS Proxy with explicit triggers (paired with #75). ADR-015 order-api idempotency semantics — Stripe-style `Idempotency-Key`, tenant-scoped, 24h replay window, 409 on payload reuse. |
| 78 | resolved | P2 | Story: storefront design system (CloudOps Dim) | Resolved 2026-05-10: scaffolded `apps/storefront` Next.js 15 App Router project. `src/styles/tokens.css` exposes the cloudops-dim palette (GitHub Dark Dimmed + Linear influence) as Tailwind v4 `@theme` keys *and* `:root` CSS custom properties; teal brand `#2dd4bf` for primary CTA + focus ring (`brand.500/60%`). 14 shadcn/ui primitives copied into `src/components/ui/` (button, card, input, label, dialog, dropdown-menu, badge, status-pill, toast via sonner, table, skeleton, separator, scroll-area, tabs); `cn()` helper at `src/lib/utils.ts`. Inter + JetBrains Mono via `next/font/google` with `display: 'swap'`. `/design` preview page at `src/app/design/page.tsx` (env-gated by `NEXT_PUBLIC_DESIGN_PREVIEW=1`; underscore-prefixed folder rejected because App Router treats `_*` as private and would 404). `test/contrast.test.ts` parses tokens.css and asserts WCAG AA ratios for every fg/bg pair (10/10 pass). `npm run build` clean (3 routes prerendered: `/`, `/design`, `/_not-found`). Storybook intentionally omitted — `/design` is the substitute. |
| 79 | resolved | P2 | Story: Next.js storefront skeleton on EKS | Resolved 2026-05-10: scaffold complete. `apps/storefront/Dockerfile` is a 2-stage build (builder runs `next build`, runtime ships `.next/standalone` + `.next/static` + `public` only) running as UID 1001 non-root with readOnlyRootFilesystem + writable `/tmp` and `/app/.next/cache` emptyDirs. `apps/storefront/k8s/` carries 9 manifests: `namespace.yaml` (PSS restricted enforce/audit/warn), `serviceaccount.yaml` (IRSA annotation placeholder for #84 + #87 roles), `deployment.yaml`, `service.yaml`, `ingress.yaml` (ALB group=`cloudops`, order=20, root domain — joins same ALB as order-api at order=30), `networkpolicy.yaml` (default-deny + allow ingress from VPC CIDR + egress to DNS / order-api NS / AWS APIs / OTel collector), `hpa.yaml` (2-10 replicas at 70% CPU), `pdb.yaml` (minAvailable=1), `servicemonitor.yaml` (`release: prometheus` label, scrapes `/api/metrics`). `apps/storefront/scripts/{render-k8s,contract-check}.ts` adapted from order-api but ESM-style (`fileURLToPath(import.meta.url)`); contract-check passes — 3 env reads in src, all provided by deployment.yaml. `scripts/validate-k8s-manifests.sh` renders + kubeconforms BOTH apps in one run: order-api 13/14 valid, storefront 11/12 valid (the one skipped each side is the ServiceMonitor CRD). `/api/health` returns `{status:'ok'}`; `/api/ready` becomes JWKS-reachability-checked once #80 lands (currently 200 unconditional with the env-gated fetch in place). New `.github/workflows/storefront.yml` mirrors `app.yml` structure (test + lint + contract-check + audit + build + manifest-validation) with build-and-push + deploy placeholders `if: false` until #84 provisions storefront ECR + IRSA. AUTO_RUN_ON_MERGE gate (#91) applied. |
| 80 | resolved | P2 | Story: Cognito User Pool + storefront auth | Resolved 2026-05-10: `modules/auth/{main,cognito,outputs,variables}.tf` provisions a Cognito User Pool with email-only signup, configurable MFA (default OPTIONAL; `prod`→ENFORCED advanced security), custom attribute `tenant_id` (immutable, max 64 chars), an `admin` user group, and a PKCE app client (no secret, code-flow, `openid email profile`). Hosted UI custom domain at `auth.<domain>` is gated by `auth_create_hosted_ui_domain` + an ACM cert in us-east-1; alias A record wired automatically. Module outputs surface `issuer_url`, `jwks_url`, `storefront_client_id`, and the Hosted UI authorize/token/logout URLs. `stacks/platform/main.tf` wires `module.auth` (count = `var.enable_auth`); 13 new platform vars (`enable_auth`, `auth_*`); 9 new outputs. Storefront side: `src/lib/auth.ts` (jose-based `verifySession`, `resolveTenant`, `isAdmin`, PKCE generator, `exchangeCode`), `src/middleware.ts` (cookie verify + admin-group gate + redirect to `/login?next=`), `src/app/login/page.tsx` (Hosted UI redirect with PKCE + state HttpOnly cookies), `src/app/auth/callback/route.ts` (state check, token exchange, sets `cloudops_session` cookie). `jose@5.9.6` added. order-api `requireTenant` extended to read `custom:tenant_id` claim in addition to `tenant_id` (Cognito attribute prefix). 59/59 order-api tests pass; storefront `npm run build` clean (now ships /login, /auth/callback, /api/ready dynamic + middleware 41 kB); `npm run contract-check` OK (7 env reads, all in deployment.yaml); kubeconform 11/12 valid for storefront; `terraform validate` clean for `modules/auth` and `stacks/platform`. |
| 81 | resolved | P2 | Story: products schema + Postgres FTS + Express routes | Resolved 2026-05-10: migration `006_products.sql` adds tenant-scoped `products` (id, sku, name, description, price_cents, qty, image_key, is_active, generated `search_tsv` tsvector, created_at/updated_at) with unique `(tenant_id, sku)`, composite `(tenant_id, is_active, created_at DESC)` index, GIN index on `search_tsv`, CHECK on tenant_id pattern, ENABLE + FORCE RLS + `tenant_isolation_products` policy. Express adds `GET /products` (paginated), `GET /products/:id` (404 outside tenant), HMAC-gated `POST /_internal/search` (`plainto_tsquery('english') AS q WHERE search_tsv @@ q ORDER BY ts_rank_cd`), and HMAC-gated `POST/PUT/DELETE /_internal/admin/products`. New HMAC middleware validates `X-CloudOps-HMAC` (`sha256(timestamp.tenant.body.secret)`) + `X-CloudOps-Timestamp` (±5 min window) + `X-CloudOps-Tenant` header, `INTERNAL_HMAC_SECRET` from env (Secrets Manager via External Secrets in non-dev). All product reads/writes route through the existing `withTenant()` so RLS is the boundary. `scripts/seed-products.ts` ships 50 products × N tenants via env-driven `TENANTS=acme,globex,initech`. OpenAPI extended with `/products` + `/products/:id` + `Product`, `ListProductsResponse`, `GetProductResponse`, `NotFoundError` schemas; spectral lint clean (0 errors). 66/66 tests pass (7 new in `test/products.test.ts`: list, 404, invalid id, HMAC missing/valid/secret-not-configured, admin create). Migration test updated for new applied list. Contract check OK (17 env reads). |
| 82 | resolved | P2 | Story: search Lambda + API GW HTTP + VPC Link | Resolved 2026-05-10: `modules/storefront-search/` provisions an HTTP API at `search.<domain>` with a Cognito JWT authorizer pointed at `module.auth.user_pool_id`, two routes (`GET /search`, `GET /products/{id}` placeholder), and an `AWS_PROXY` Lambda integration. `search-gateway` Lambda (Node 22 arm64, 256 MB, 5 s, X-Ray active) in `lambda_function/index.mjs` reads `custom:tenant_id` from authorizer claims, maintains a 500-entry LRU cache keyed by `tenant#search#q#limit` (60 s TTL), pulls the HMAC secret from SSM Parameter Store (5 min cache), signs `sha256(timestamp.tenant.body.secret)` matching #81, and POSTs to `${ORDER_API_INTERNAL_URL}/_internal/search` via VPC ENIs. IAM = BasicExecution + VPCAccess + X-Ray + narrow SSM/KMS scoped to the HMAC param. 11 new `storefront_search_*` vars + 2 outputs on `stacks/platform`; default off, custom-domain gated. `scripts/build-lambdas.sh` extended; lockfile committed; `data.archive_file` zips the dir. Lifecycle precondition fails plan if deps missing. `apps/storefront/src/lib/api.ts` adds RSC-side `listProducts`, `getProduct`, `searchProducts` clients (Bearer = session cookie). `terraform validate` clean. |
| 83 | resolved | P2 | Story: storefront product list + detail pages | Resolved 2026-05-10: `apps/storefront/src/app/products/page.tsx` is an RSC catalog. With `?q=` set it hits `searchProducts()` (search.<domain>); without it lists from `api.<domain>/products`. Server-side render, zero client JS on the cards. `SearchBar` is a 300ms-debounced client island that updates the URL via `router.replace`. `Pagination` ships ←/→ links with shareable URLs. `/products/[id]` renders the detail (description split by newlines, mono SKU/price, `AddToCartButton` disabled until #84, stock pill). Each route gets a `loading.tsx` skeleton + `error.tsx` retry pane. `ProductCard` and `ProductGrid` are pure visual primitives that read `Product` from `@/lib/api`. ESLint flat config patched (dropped `eslint-config-next` because its Rushstack patch breaks ESLint 9 flat mode); `npm run lint` clean. `npm run build` produces 8 routes (`/`, `/_not-found`, `/api/health`, `/api/ready`, `/auth/callback`, `/design`, `/products`, `/products/[id]`) + 41 kB middleware. Contract check OK (9 env reads). Lighthouse run deferred — needs the real cluster + Cognito to navigate auth-gated screens. |
| 84 | resolved | P2 | Story: DynamoDB cart + cart UI | Resolved 2026-05-10: `modules/storefront-cart/` provisions Dynamo `cloudops-cart-<env>` (PAY_PER_REQUEST, PK=`TENANT#<t>#USER#<sub>` or `GUEST#<anonId>`, SK=`ITEM#<sku>`, TTL `expires_at` 7d, SSE enabled, PITR + deletion_protection toggled by environment) + IRSA role trusted by the storefront ServiceAccount via the cluster OIDC provider, scoped to GetItem/PutItem/UpdateItem/DeleteItem/Query/BatchWriteItem/BatchGetItem on the cart table only. Stack vars: `enable_storefront_cart`, `storefront_namespace`, `storefront_service_account`; outputs `storefront_cart_table_name`, `storefront_cart_irsa_role_arn`. Storefront `src/lib/cart.ts` resolves a cart key from session cookie (`TENANT#<t>#USER#<sub>`) or guest cookie (`GUEST#<uuid>`, HttpOnly 30d), uses `@aws-sdk/lib-dynamodb` `DynamoDBDocumentClient` for typed UpdateCommand/QueryCommand/DeleteCommand. Next.js API routes: `GET/POST /api/cart` (count + add), `PATCH/DELETE /api/cart/[itemId]` (qty update + remove). `/cart` page is RSC + `CartView` client island with optimistic +/- and remove-on-zero; refresh-fetch on every mutation via `router.refresh()`. `AddToCartButton` now POSTs to `/api/cart` with optimistic Added ✓ → idle. `npm run build` 11 routes incl. `/cart`, `/api/cart`, `/api/cart/[itemId]`. Lint clean, contract check 11 env reads OK, `terraform validate` clean for module + stack. Guest-cart merge-on-login deferred (one BatchWriteItem in the `auth/callback` route — separate small change). |
| 85 | resolved | P2 | Story: Kinesis stream + Express order event publisher | Resolved 2026-05-10: `modules/storefront-events/` provisions `cloudops-<env>-orders-events` Kinesis Data Stream in ON_DEMAND mode, configurable retention (default 24h), KMS encryption (CMK ARN if provided else `alias/aws/kinesis`), shard-level metrics enabled. Publisher policy (`kinesis:PutRecord/PutRecords/DescribeStream*` scoped to the stream ARN, optional `kms:GenerateDataKey` when a CMK is in use) attaches to the order-api IRSA role by name (`storefront_events_order_api_role_name`, sourced from the cluster stack). 4 new platform vars + 2 outputs. `apps/order-api/src/kinesis.ts` exports `createPublisher({...})` returning `publishOrderEvent({tenantId, orderId, type, payload})`; partitions by tenantId so per-tenant ordering survives, one-shot retry on `ProvisionedThroughputExceededException`. `server.ts` constructs the publisher; `app.ts` accepts it as a `CreateAppArgs` field and calls it post-commit on 201 — Kinesis outage never rolls back the order. On failure the path writes `audit_events.result='kinesis_publish_failed'` in a fresh tenant transaction. `KINESIS_STREAM_NAME` added to deployment.yaml + validate script. 69/69 tests pass (3 new in `test/kinesis.test.ts`: partition-key shape, stream-not-configured, send-failure error surface). Lint clean, contract check 18 env reads OK, `terraform validate` clean for module + stack. |
| 86 | resolved | P2 | Story: API GW WebSocket + connection registry + fanout Lambda | Resolved 2026-05-13: `modules/storefront-realtime/` provisions a WEBSOCKET API GW + 3 Lambdas + a Dynamo connection registry. Dynamo `cloudops-<env>-ws-connections` (PAY_PER_REQUEST, PK=`connId`, GSI `by-tenant` on `tenantId`+`connId`, TTL 24h). `ws-connect` (Node 22 arm64) extracts JWT from `Sec-WebSocket-Protocol` (or `?token=`), verifies via Cognito JWKS using `module.auth.issuer_url` + `storefront_client_id` audience, writes `{connId, tenantId, sub, expires_at}`. `ws-disconnect` deletes by `connId`. `ws-fanout` is a Kinesis event-source consumer (batch 100, 1s window, bisect-on-error, parallelization 2) that queries the GSI by `tenant_id` and calls `PostToConnection`; 410 Gone prunes the stale row. IAM strictly scoped per Lambda (PutItem / DeleteItem / Query+Delete+ManageConnections), optional SQS DLQ. Custom domain `ws.<domain>` gated. 5 new platform vars + 2 outputs. `scripts/build-lambdas.sh` extended for the 3 new dirs. Storefront `src/lib/ws.ts` exposes `useOrderUpdates(orderId)` with exponential reconnect (cap 30s); `OrderStatusPill` flips to the `live` variant on every fanout event. `/api/ws-token` mints a 5-min HS256 JWT signed with `WS_TOKEN_SECRET` (aud `cloudops-ws`). New `/orders` + `/orders/[id]` RSC pages call `api.<domain>/orders` with the session cookie. Build clean (14 routes); contract check 13 env reads; lint clean; `terraform validate` clean for module + stack; kubeconform 13/14 + 11/12. |
| 87 | resolved | P2 | Story: Step Functions checkout saga + checkout page | Resolved 2026-05-13: `modules/storefront-checkout/` provisions a STANDARD Step Functions state machine `cloudops-<env>-checkout` with two task states: `CreateOrder` (HTTP task `arn:aws:states:::http:invoke` POSTing to `${order_api_url}/order` with `Idempotency-Key` = SF execution name + `X-Tenant-Id` from input — Express #72 idempotency does the heavy lifting) → `EnqueueEmail` (`arn:aws:states:::sqs:sendMessage` to the SQS email queue) → success. `Catch` on `States.ALL` routes to a `Fail` state with `error=CheckoutSagaFailed`. Logging configured (`/aws/states/cloudops-<env>-checkout`, ERROR level + execution data) + X-Ray tracing enabled. New email Lambda (`cloudops-<env>-order-email`, Node 22 arm64) consumes the SQS queue; renders HTML + text and sends via SESv2 when `SES_SOURCE_EMAIL` is set, otherwise logs and exits gracefully. SQS email queue has a paired DLQ (`-dlq`) with maxReceiveCount=3. Three IAM roles created (sfn role with sqs:SendMessage + logs; email Lambda role with BasicExecution + SQSExecution + optional ses:SendEmail; storefront IRSA role gets `states:StartExecution` + `DescribeExecution` on this state machine when `storefront_irsa_role_name` is set). 4 new platform vars + 2 outputs. Storefront `/api/checkout` Route Handler reads the cart via `getCart()`, computes the hash, derives `execName=<sub-prefix>-<cart-hash>` (gives free idempotency on rapid double-clicks), POSTs `StartExecutionCommand` (`@aws-sdk/client-sfn`), returns the execution ARN. `/checkout` RSC renders the line items + total + `CheckoutButton` (client) which calls the route and redirects to `/checkout/success?executionArn=...`. `/checkout/success` is an RSC placeholder pointing at `/orders` (full DescribeExecution polling can ride on the next iteration). Build clean (16 routes incl. /checkout + /checkout/success + /api/checkout); contract check OK (14 env reads); lint clean; `terraform validate` clean for module + stack. Inventory reservation (atomic dec via Express `_internal/admin/products` PATCH) deferred — products schema (#81) has the qty column but no DECR endpoint yet. |
| 88 | resolved | P3 | Story: S3+CloudFront assets + image-resize Lambda + admin uploader | Resolved 2026-05-13: `modules/storefront-assets/` provisions `cloudops-<env>-assets` S3 bucket (BucketOwnerEnforced, versioning on, AES256 SSE with bucket-key-enabled, all-public-access blocks on, CORS for PUT from the storefront origin), a CloudFront distribution with an OAC, AWS-managed CachingOptimized policy + a strict response-headers policy (HSTS, X-Content-Type-Options, X-Frame-Options=DENY, Referrer-Policy=no-referrer), and the bucket policy locks S3 reads to that distribution via `AWS:SourceArn`. `image-resize` Lambda (Node 22 arm64, 1024 MB / 30 s) is wired as an S3 PUT notification on `originals/*` — sharp resizes each upload into `resized/{sm,md,lg}/<key>.webp` with `Cache-Control: public, max-age=31536000, immutable`. Sharp can be supplied via Lambda layer (`storefront_assets_sharp_layer_arn`) or packaged in the zip; the Linux arm64 binding only resolves on a Linux CI build runner — Windows dev installs are skipped on purpose. IAM is split: resize role gets `s3:GetObject` on `originals/*` and `s3:PutObject` on `resized/*` only; the storefront IRSA gains `s3:PutObject` on `originals/*` for the presigned upload. CloudFront alias `assets.<domain>` is gated by `storefront_assets_create_custom_domain` (cert must live in us-east-1). 6 new platform vars + 2 outputs. Storefront `/admin` is a Cognito `admin`-group-gated layout; `/admin/upload` is an RSC page rendering the `ImageUploader` client component; `/api/admin/upload` Route Handler verifies the JWT cookie + admin claim, validates filename + Content-Type, returns a 60 s presigned PUT URL. Build clean (19 routes); contract check 15 env reads; lint clean; `terraform validate` clean for module + stack. DLQ on resize failures + per-prefix admin product CRUD wiring tied off to the Express `_internal/admin/products` route from #81 (no new endpoint added in this story; admin UI uses the storefront-side upload to populate `image_key` on existing products). |
| 89 | resolved | P2 | Story: storefront observability + Grafana dashboard | Resolved 2026-05-13: storefront wired into the existing OTel stack via `@vercel/otel` + a Next.js 15 `src/instrumentation.ts` `register()` (auto-loaded in Next 15 — no experimental flag needed). Resource attrs use `OTEL_SERVICE_NAME=storefront` so the existing collector pipeline + Tempo trace UI stitch the chain. `modules/observability/yace.tf` discovery jobs extended with `AWS/States`, `AWS/Kinesis`, `AWS/ApiGateway`, `AWS/CloudFront` (us-east-1 — CloudFront is region-bound), `AWS/Cognito`. New `kubernetes_config_map.storefront` in `dashboards.tf` ships `dashboards/storefront.json` with 10 panels covering: checkout SLO (success rate from SF), search latency p95, WS connection success (1 - error/invocation on `ws-connect`), storefront RSC p50/p95/p99, search-gateway cache hit rate, WS active connections, Kinesis iterator age, SF executions by status, CloudFront 4xx/5xx, Cognito sign-in success. `yace_alerts` PrometheusRule extends with the `cloudwatch.storefront` group: `KinesisLagHigh` (>60s, 5m, warning), `KinesisLagCritical` (>300s, 5m, critical), `SFExecutionFailureHigh` (>5% for 10m), `WSFanoutErrorHigh` (>1% for 5m), `CloudFront5xxHigh` (>1% for 5m). Build clean (19 routes, middleware now 91 kB after OTel); contract check 17 env reads OK; lint clean; `terraform validate` clean on `modules/observability`. ADOT Lambda layer attachment + checkout SLO multi-window burn rule deferred — single-window thresholds shipped instead. |
| 90 | resolved | P3 | Story: storefront ADRs + master runbook updates | Resolved 2026-05-13: 5 ADRs added under `docs/adr/` — ADR-016 Cognito over Auth0/Clerk (slots into existing auth-jwt.ts), ADR-017 Lambda+EKS hybrid search (data gravity at cluster, edge logic at Lambda), ADR-018 API GW WebSocket over AppSync subscriptions (explicit connection registry, no GraphQL surface for one feature), ADR-019 Step Functions Standard for checkout saga (durable history + native Catch beats in-process txn / SF Express), ADR-020 Next.js standalone on EKS over Lambda@Edge / OpenNext (reuses every platform pattern). README ADR index updated. Two new runbooks: `docs/runbooks/demo-bringup.md` walks 60-min clean-account → working storefront in 6 stages (bootstrap → foundation → cluster → platform → seed → smoke test) with verify commands; `docs/runbooks/demo-teardown.md` walks the reverse (stop SF executions, empty S3, truncate Dynamo, destroy platform → cluster → foundation → optional bootstrap) with a cost-gotcha table (EKS $0.10/hr, RDS $0.018/hr, NAT $0.045/hr, etc.). Master runbook gains `9.5 Storefront` with subsections for Cognito signup, secrets rotation table, WS troubleshooting, and checkout-saga compensation. `scripts/destroy.sh` extended with Step 0 (storefront pre-destroy): stops running checkout executions via `aws stepfunctions stop-execution`, empties `cloudops-<env>-assets` S3, soft-truncates `cloudops-<env>-cart` Dynamo, surfaces WS connection-table TTL behavior and Kinesis on-demand stream presence. All blocks `|| true`-wrapped so missing resources don't abort the script. `bash -n` clean. |
| 91 | resolved | P2 | Gate auto-run on merge behind `AUTO_RUN_ON_MERGE` repo variable | Resolved 2026-05-10: `app.yml` `test`, `infra.yml` `quality`, and `libraries.yml`'s six `*-check` jobs + `publish-plan` (all entry-level jobs without `needs:`) gain `if: github.event_name != 'push' \|\| vars.AUTO_RUN_ON_MERGE == 'true'`. Default = unset → auto-run on merge to `main` is OFF. Pull requests and `workflow_dispatch` always fire. To enable: `gh variable set AUTO_RUN_ON_MERGE --body true`; to disable: `gh variable delete AUTO_RUN_ON_MERGE`. README "Workflows" section documents the toggle. Downstream jobs cascade-skip via existing `needs:` chains, so disabling one entry-level gate skips the whole pipeline graph for that workflow on push. PR signal (test/lint/plan-pr/manifest-validation) intentionally untouched — PR validation stays enforced regardless of the toggle. |

| 92 | resolved | P1 | Fix storefront cookie writes from Server Component paths | Resolved 2026-05-13: `apps/storefront/src/lib/cart.ts` split into read-only `resolveCartKey()` (returns `CartKey \| null`, safe for RSC) and write-capable `ensureCartKey()` (mints + sets the `cloudops_guest_id` cookie, Route Handler / Server Action only). `/cart` + `/checkout` RSC pages now treat the null branch as "no cart yet"; `/api/cart` POST uses `ensureCartKey()` so the guest cookie is issued on first add, GET stays read-only, `/api/cart/[itemId]` PATCH/DELETE return 404 when no cart key exists, `/api/checkout` returns `cart_empty` 400. Login flow: PKCE + state + next cookies move from `/login/page.tsx` into a new `/login/start/route.ts` Route Handler that sets them on a `NextResponse.redirect()`. `/login/page.tsx` becomes a `force-dynamic` Server Component that renders the "auth unavailable" branch only and redirects to `/login/start` when Cognito env vars are present. 24/24 tests pass, lint clean, contract check 17 env reads OK, `npm run build` 22 routes (login + login/start both `ƒ` dynamic). |
| 93 | resolved | P2 | Diagnose storefront production build hang | Resolved 2026-05-13: hang was downstream of #92 — `/login/page.tsx` mutated cookies during Next 15's static-analysis prerender pass, which left the build worker spinning on the throw path. After the #92 split (page renders only the unconfigured fallback + redirects to `/login/start` route handler), `rm -rf .next && npm run build` runs to completion in ~37s on Windows: Next 15.5.18, 22 routes (`/` `/admin` `/admin/upload` `/design` static; everything else `ƒ` dynamic), 102 kB shared chunks, 89.9 kB middleware. No high-CPU Node process left over. |
| 94 | resolved | P3 | Restore Terraform fmt cleanliness for storefront modules | Resolved 2026-05-13: ran `terraform fmt -recursive` from repo root, normalised the 9 files (`modules/storefront-assets/lambda_resize.tf`, `modules/storefront-checkout/step_functions.tf`, `modules/storefront-realtime/{iam,main,outputs,ws_api}.tf`, `modules/storefront-search/{api_gateway,lambda}.tf`, `stacks/platform/main.tf`). `terraform fmt -check -recursive` now exits 0. |

### Open Fix Order

Source of truth for next work as of 2026-05-13. Goal: prod-shaped behavior,
dev-priced runtime. Cheap envs may use smaller compute, lower retention, no
destroy locks, and fewer HA resources; they must still exercise the same
deploy, approval, auth, security, migration, rollback, state, and drift paths.

Sorted by prod-equivalence importance first, then difficulty. Difficulty:
`D1` small, `D2` moderate, `D3` broad, `D4` architectural.

| Order | ID | P | D | Why next | First fix |
|-------|----|---|----|----------|-----------|
| ~~0~~ | ~~92~~ | P1 | D2 | Resolved 2026-05-13 — see backlog row. | — |
| 1 | 16 | P1 | D4 | Layered CI path is coded; live migration proof is still missing. | Run the migration runbook against a real environment and remove/retire the gated legacy recovery steps after validation. |
| ~~2~~ | ~~93~~ | P2 | D2 | Resolved 2026-05-13 — see backlog row. | — |
| ~~3~~ | ~~94~~ | P3 | D1 | Resolved 2026-05-13 — see backlog row. | — |
| ~~2~~ | ~~49~~ | P1 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~3~~ | ~~50~~ | P1 | D3 | Resolved 2026-05-05 — see backlog row. | — |
| ~~4~~ | ~~51~~ | P1 | D4 | Resolved 2026-05-05 — see backlog row. | — |
| ~~5~~ | ~~52~~ | P1 | D3 | Resolved 2026-05-05 — see backlog row. | — |
| ~~6~~ | ~~53~~ | P1 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~7~~ | ~~54~~ | P1 | D3 | Resolved 2026-05-05 — see backlog row. | — |
| ~~8~~ | ~~56~~ | P2 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~9~~ | ~~57~~ | P2 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~10~~ | ~~58~~ | P2 | D3 | Resolved 2026-05-05 — see backlog row. | — |
| ~~11~~ | ~~59~~ | P2 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~12~~ | ~~61~~ | P2 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| 13 | 9 | P2 | D4 | mTLS and L7 east-west controls remain missing. | Revisit after #16; decide Cilium service mesh vs separate mesh. |
| ~~14~~ | ~~62~~ | P3 | D2 | Resolved 2026-05-05 — see backlog row. | — |
| ~~15~~ | ~~60~~ | P3 | D1 | Resolved 2026-05-05 — see backlog row. | — |
| ~~16~~ | ~~65~~ | P2 | D2 | Resolved 2026-05-08 — see backlog row. | — |
| ~~17~~ | ~~67~~ | P2 | D2 | Resolved 2026-05-08 — see backlog row. | — |
| ~~18~~ | ~~68~~ | P2 | D3 | Resolved 2026-05-08 — see backlog row. | — |
| 19 | 69 | P2 | D3 | C++ gate lifted; Java + .NET pending — needs JVM/.NET toolchain to verify a higher gate. | Run `mvn verify` and `dotnet test` in CI, raise threshold per language to current %, add edge-path tests. |
| ~~20~~ | ~~66~~ | P3 | D1 | Resolved 2026-05-08 — see backlog row. | — |
| ~~21~~ | ~~70~~ | P3 | D2 | Resolved 2026-05-08 — see backlog row. | — |
| ~~22~~ | ~~71~~ | P2 | D1 | Resolved 2026-05-09 — see backlog row. | — |
| ~~23~~ | ~~72~~ | P2 | D2 | Resolved 2026-05-09 — see backlog row. | — |
| ~~24~~ | ~~74~~ | P3 | D2 | Resolved 2026-05-09 — see backlog row. | — |
| ~~25~~ | ~~73~~ | P2 | D3 | Resolved 2026-05-09 — see backlog row. | — |
| ~~26~~ | ~~75~~ | P2 | D2 | Resolved 2026-05-09 — see backlog row (deferred via ADR-014). | — |
| 27 | 76 | P2 | D4 | Emergency CIDR is break-glass; private endpoint deploys need a normal production path. | Design runner-in-VPC architecture and decide module scope. |
| ~~28~~ | ~~77~~ | P3 | D2 | Resolved 2026-05-09 — see backlog row (ADR-011 to ADR-015 added). | — |
| ~~29~~ | ~~78~~ | P2 | D2 | Resolved 2026-05-10 — see backlog row. | — |
| ~~30~~ | ~~79~~ | P2 | D2 | Resolved 2026-05-10 — see backlog row. | — |
| ~~31~~ | ~~80~~ | P2 | D3 | Resolved 2026-05-10 — see backlog row. | — |
| ~~32~~ | ~~81~~ | P2 | D2 | Resolved 2026-05-10 — see backlog row. | — |
| ~~33~~ | ~~82~~ | P2 | D3 | Resolved 2026-05-10 — see backlog row. | — |
| ~~34~~ | ~~83~~ | P2 | D2 | Resolved 2026-05-10 — see backlog row. | — |
| ~~35~~ | ~~84~~ | P2 | D3 | Resolved 2026-05-10 — see backlog row. | — |
| ~~36~~ | ~~85~~ | P2 | D2 | Resolved 2026-05-10 — see backlog row. | — |
| ~~37~~ | ~~86~~ | P2 | D4 | Resolved 2026-05-13 — see backlog row. | — |
| ~~38~~ | ~~87~~ | P2 | D4 | Resolved 2026-05-13 — see backlog row. | — |
| ~~39~~ | ~~88~~ | P3 | D3 | Resolved 2026-05-13 — see backlog row. | — |
| ~~40~~ | ~~89~~ | P2 | D2 | Resolved 2026-05-13 — see backlog row. | — |
| ~~41~~ | ~~90~~ | P3 | D2 | Resolved 2026-05-13 — see backlog row. | — |

### Open Story Details

(Order below follows the long-running platform story sequence. The tactical fix queue above is the source of truth for immediate next work.)

#### #16 — split Terraform into layered states
**User story:** As a platform operator, I want Terraform split into stable layers so plans are reliable and applies do not need `-target` choreography.

**Start files:** `main.tf`, `provider.tf`, `outputs.tf`, `scripts/tf-init.sh`, `.github/workflows/infra.yml`, `modules/*`.

**Implementation notes:**
- Create separate root stacks, e.g. `stacks/foundation`, `stacks/cluster`, `stacks/platform`, `stacks/apps` or similar.
- Foundation owns bootstrap, dns, networking, database, compliance/backup if desired.
- Cluster owns EKS and exports endpoint/OIDC/node SG outputs.
- Platform owns Helm/Kubernetes addons: ingress controller, observability, security, self-healing, SLO, FinOps.
- Apps stack or app pipeline owns order-api Kubernetes manifests.
- Use `terraform_remote_state` or explicit CI artifacts for cross-stack outputs.
- Replace normal CI `continue-on-error` plans and broad `-target` staged applies with real stack plans/applies.

**Acceptance criteria:**
- Fresh CI can run a successful plan for each stack without needing Kubernetes provider localhost fallback.
- Normal apply path does not use `-target` except documented import/recovery operations.
- Per-env state keys remain isolated (`dev/terraform.tfstate`, etc.).
- README / deploy docs show the new stack order.

---

#### #64 — Convert order-api App From JS To TS
**User story:** As a CloudOps platform engineer, I want the `apps/order-api` application converted from JavaScript to TypeScript so API code, tests, migrations, auth, tracing, and deployment scripts have compile-time safety before shipping.

**Scope:** Convert `apps/order-api/src/*.js`, `apps/order-api/test/*.js`, and `apps/order-api/scripts/*.js` to TypeScript. Keep runtime behavior unchanged unless a typing issue exposes a real bug.

**Start files:** `apps/order-api/package.json`, `apps/order-api/eslint.config.js`, `apps/order-api/Dockerfile`, `apps/order-api/src/*`, `apps/order-api/test/*`, `apps/order-api/scripts/*`, `apps/order-api/k8s/migration-job.yaml`, `.github/workflows/app.yml`, `scripts/deploy.sh`, `scripts/validate-k8s-manifests.sh`.

**Implementation notes:**
- Add `typescript`, `@types/node`, and app dependency types such as `@types/express` / `@types/pg` where needed.
- Add `apps/order-api/tsconfig.json`; prefer CommonJS-compatible output first to minimize runtime and Docker changes.
- Compile application code to `dist/`; update `start`, `dev`, `migrate`, `contract-check`, Docker `CMD`, and Kubernetes migration command accordingly.
- Decide whether tests run through a TS runner or against compiled output; keep `node --test` compatibility.
- Update ESLint config to cover `.ts` files and preserve the current low-noise bug-catching rules.

**Acceptance criteria:**
- No checked-in app source remains as `.js` under `apps/order-api/src`, `apps/order-api/test`, or `apps/order-api/scripts` except generated output if intentionally committed.
- `npm run build`, `npm test`, `npm run lint`, and `npm run contract-check` pass in `apps/order-api`.
- Docker image runs `dist/server.js` and migration Job runs `dist/migrate.js`.
- App workflow and local manifest validation still render Kubernetes manifests successfully.
- Existing API behavior, auth behavior, migrations, and integration-test contracts remain unchanged.

---

#### #65 - make coverage source-of-truth per package
**User story:** As a maintainer, I want every implemented package to expose a standard coverage command so CI can enforce coverage without SonarQube.

**Scope:** Add or normalize coverage scripts for `apps/order-api`, `libraries/nodejs/logs`, `libraries/python/logs`, `libraries/go/logs`, `libraries/java/logs`, `libraries/dotnet/logs`, and `libraries/cpp/logs`.

**Start files:** `package.json`, `apps/order-api/package.json`, `libraries/*/logs/*`, `.github/workflows/app.yml`, `.github/workflows/libraries.yml`, `docs/library-publishing.md`, `libraries/README.md`.

**Implementation notes:**
- Keep order-api's source-line gate at 100%.
- For each library, define the exact covered source path and explicit exclusions such as generated output, examples, build folders, and package entrypoint re-export files.
- Prefer language-native tools already present: Node test runner coverage, Python `coverage.py`, Go `go test -coverprofile`, Maven/Jacoco, Coverlet, and gcovr.
- Do not introduce SonarQube or SonarCloud in this story.

**Acceptance criteria:**
- Repo documentation lists each package's coverage command, report output, threshold, and exclusions.
- CI can run each package coverage command from a clean checkout.
- Coverage thresholds are enforced by the package job, not by a human reading logs.

---

#### #66 - upload coverage reports as CI artifacts
**User story:** As a reviewer, I want downloadable coverage reports from GitHub Actions so I can inspect missed lines and branches without SonarQube.

**Scope:** Publish coverage artifacts from app and library workflows.

**Start files:** `.github/workflows/app.yml`, `.github/workflows/libraries.yml`, package coverage configs/scripts.

**Implementation notes:**
- Upload coverage reports with `actions/upload-artifact`.
- Use artifact names like `coverage-order-api`, `coverage-nodejs-logs`, `coverage-python-logs`, etc.
- Prefer HTML where easy, plus XML/text summaries for machine readability.
- Keep artifacts scoped to non-secret test outputs; do not upload `.env`, tfvars, state, or raw secret material.

**Acceptance criteria:**
- A failed coverage job leaves enough artifact detail to identify missed files/lines from the Actions UI.
- Artifact upload runs with `if: always()` so reports are available on failed gates when generated.
- Artifact retention is bounded to a reasonable CI retention window.

---

#### #67 - raise order-api beyond line coverage
**User story:** As an API owner, I want order-api coverage to include branch and function risk, not just 100% line coverage, so edge behavior stays protected.

**Scope:** Improve `apps/order-api` branch/function coverage and decide how to handle bootstrap files.

**Start files:** `apps/order-api/src/*.ts`, `apps/order-api/test/*.test.ts`, `apps/order-api/package.json`, `.github/workflows/app.yml`.

**Implementation notes:**
- Current line coverage gate covers source modules and excludes `server.ts`, `migrate.ts`, and `tracing.ts`.
- Add tests for missing branches in auth, tenant resolution, validation, metrics, migration, and error paths where practical.
- For process bootstrap files, either extract testable seams or document why the file remains excluded.
- If Node's built-in coverage thresholds cannot gate branch/function coverage cleanly, add a small coverage-summary check script rather than weakening the line gate.

**Acceptance criteria:**
- order-api keeps 100% source line coverage.
- Branch/function coverage target is documented and enforced when tooling supports it.
- Excluded entrypoints have explicit justification in the coverage script/docs.
- `npm run test:coverage`, `npm test`, `npm run lint`, and `npm run build` still pass.

---

#### #68 - lift Node/Python/Go library coverage gates
**User story:** As an SDK maintainer, I want the fast library ports to have meaningful coverage gates so config, sampling, exporter, and runtime-detection regressions fail in CI.

**Scope:** Improve coverage for `libraries/nodejs/logs`, `libraries/python/logs`, and `libraries/go/logs`.

**Start files:** `libraries/nodejs/logs/src/*`, `libraries/nodejs/logs/test/*`, `libraries/python/logs/src/*`, `libraries/python/logs/tests/*`, `libraries/go/logs/*.go`, `.github/workflows/libraries.yml`, `docs/library-publishing.md`.

**Implementation notes:**
- Cover valid and invalid env parsing, JSON-vs-CSV list parsing, endpoint normalization, API-key/header fallback, exporter fallback, sampler rate edges, error-log bypass, runtime attributes for Lambda/ECS/EKS, and OTLP failure fallback.
- Raise thresholds in increments backed by the actual reports from CI.
- Keep tests offline and deterministic; use local HTTP servers for OTLP/JWKS-style behavior when needed.

**Acceptance criteria:**
- Node/Python/Go logs coverage thresholds are materially higher than their current starter gates.
- New tests cover both success paths and misconfiguration/failure paths.
- `libraries.yml` fails when any of these packages drops below the new thresholds.

---

#### #69 - lift Java/.NET/C++ library coverage gates
**User story:** As an SDK maintainer, I want the Java, .NET, and C++ ports to reach coverage parity with the rest of the library contract.

**Scope:** Improve coverage for `libraries/java/logs`, `libraries/dotnet/logs`, and `libraries/cpp/logs`.

**Start files:** `libraries/java/logs/src/main`, `libraries/java/logs/src/test`, `libraries/java/logs/pom.xml`, `libraries/dotnet/logs/src`, `libraries/dotnet/logs/tests`, `libraries/cpp/logs/src`, `libraries/cpp/logs/include`, `libraries/cpp/logs/tests`, `.github/workflows/libraries.yml`.

**Implementation notes:**
- Mirror the same SDK contract covered by #68: config parsing, resource detection, sampling, log rendering, exporter setup/fallback, and failure behavior.
- Raise Jacoco, Coverlet, and gcovr gates in staged increments after tests land.
- Avoid brittle tests that rely on host machine environment; isolate environment variables per test.

**Acceptance criteria:**
- Java/.NET/C++ logs coverage gates are higher than their current starter gates.
- Tests exercise failure/edge paths, not only happy-path smoke behavior.
- CI reports exact coverage numbers in the job output and fails below threshold.

---

#### #70 - make non-Sonar static quality gate explicit
**User story:** As a platform maintainer, I want a single no-Sonar quality gate so PRs consistently run the same static checks and coverage gates.

**Scope:** Consolidate and document existing quality checks without adding SonarQube/SonarCloud.

**Start files:** `.github/workflows/app.yml`, `.github/workflows/infra.yml`, `.github/workflows/libraries.yml`, `scripts/validate-k8s-manifests.sh`, `README.md`, `docs/library-publishing.md`.

**Implementation notes:**
- Keep using existing tools: ESLint, TypeScript build, npm audit, Terraform validation, tflint, actionlint, kubeconform, language-native unit tests, and coverage gates.
- Make the gate visible in workflow summaries.
- Prefer one documented checklist/table over scattered tribal knowledge.
- Do not add hosted static-analysis services in this story.

**Acceptance criteria:**
- PR workflows clearly show which quality gates ran and which package/stack they apply to.
- Docs list every required local/CI command for app, infra, and libraries.
- Quality gate behavior is deterministic for PRs without deploy-grade AWS credentials.

---

#### #76 - self-hosted GitHub runner in VPC
**User story:** As a platform operator, I want a normal CI path to private EKS endpoints so deploys do not depend on widening public cluster access except for break-glass.

**Scope:** Architecture decision, Terraform/module design, workflow changes, and private endpoint runbook.

**Start files:** `.github/workflows/infra.yml`, `.github/workflows/app.yml`, `.github/workflows/eks-emergency-access.yml`, `docs/private-eks-access.md`, `modules/*`, `stacks/*`.

**Implementation notes:**
- Prefer ephemeral or tightly-scoped self-hosted runners in private subnets with least-privilege IAM and no broad inbound access.
- Decide whether to use EC2, Actions Runner Controller on EKS, or an AWS-managed runner pattern if available to the account.
- Keep the emergency CIDR workflow as break-glass, not the normal path.
- Document patching, runner registration token handling, egress, logs, scaling, and teardown behavior.
- Avoid putting long-lived GitHub runner tokens in Terraform state.

**Acceptance criteria:**
- ADR or design doc chooses the runner pattern and explains rejected options.
- CI workflows can target the private runner for cluster-touching jobs.
- Break-glass workflow remains available and documented as exceptional access.

---

#### #61 — publish OTel ingestion config to SSM Parameter Store
**User story:** As a telemetry producer running in this or another AWS account, I want to read the CloudOps OTel endpoint URLs and bearer token from AWS SSM Parameter Store so my OpenTelemetry SDK configuration does not depend on Terraform outputs, Kubernetes secrets, or copied values.

**Scope boundary:** This story creates and stores the OTel URLs and auth key only. It does not create custom metrics, traces, or logs libraries.

**Start files:** `modules/observability/secrets.tf`, `modules/observability/outputs.tf`, `modules/observability/variables.tf`, `main.tf`, `outputs.tf`, `variables.tf`, `docs/runbooks/master-runbook.md`, `docs/adr/003-otel-collector-gateway.md`, `terraform.tfvars.example`, `environments/*.tfvars.example`.

**What exists today:**
- The OTel Collector is deployed in `modules/observability/otel_collector.tf`.
- The collector accepts OTLP/gRPC on 4317 and OTLP/HTTP on 4318, both protected by `bearertokenauth`.
- Public/private reachability is via `https://otel.${domain}` on ALB port 443; the ALB forwards to the right collector service port.
- The bearer token already exists as `random_password.otel_api_key.result` in `modules/observability/secrets.tf`.
- That token is already copied into AWS Secrets Manager and Kubernetes `otel-auth` Secrets. Do not create a second token or a second source of truth.

**What to build:**
- Add Terraform-managed `aws_ssm_parameter` resources, probably in a new file such as `modules/observability/ssm_parameters.tf`.
- Parameters must be created by the observability module so they exist only when `enable_observability=true`.
- Use an environment-scoped path so dev/staging/prod and future accounts do not collide. Default path shape:
  - `/cloudops/${var.environment}/otel/endpoint`
  - `/cloudops/${var.environment}/otel/endpoint/metrics`
  - `/cloudops/${var.environment}/otel/endpoint/traces`
  - `/cloudops/${var.environment}/otel/endpoint/logs`
  - `/cloudops/${var.environment}/otel/api-key`
- Consider adding a variable such as `otel_ssm_parameter_prefix` if the path needs to be configurable. Default should be `/cloudops/${var.environment}/otel`; keep names deterministic.

**Parameter values and types:**
- Store URL values as SSM `String`:
  - `endpoint` = `https://otel.${var.domain}`
  - `endpoint/metrics` = `https://otel.${var.domain}/v1/metrics`
  - `endpoint/traces` = `https://otel.${var.domain}/v1/traces`
  - `endpoint/logs` = `https://otel.${var.domain}/v1/logs`
- Store `api-key` as SSM `SecureString` with value `random_password.otel_api_key.result`.
- The `/v1/{metrics,traces,logs}` paths are OTLP/HTTP endpoints. For OTLP/gRPC clients, use the base `endpoint` value without a `/v1/...` path.
- Do not store the literal `Authorization: Bearer ...` header as a separate parameter unless a future story asks for it. Store the key only; SDK/library code can format the header.

**Security / KMS notes:**
- The SSM token must be a `SecureString`. Terraform state will still contain the generated token because Terraform manages `random_password` and the SSM parameter value; treat the state bucket/KMS controls as part of the security boundary.
- Prefer CMK-backed SecureString in staging/prod if there is already a suitable secrets/SSM KMS key. If not, keep the first implementation simple and use the default SSM KMS key, then create a follow-up for a dedicated SSM/secrets CMK.
- Add tags consistent with other observability resources (`Component=observability`, `ManagedBy=terraform`, environment/common tags).
- Do not broaden producer-account IAM in this story unless explicitly requested. Document the IAM policy that producer accounts need instead.

**Outputs / discovery contract:**
- Add outputs for parameter names/ARNs, not for the token plaintext. Useful output shape:
  - `otel_ssm_parameter_names`
  - `otel_ssm_parameter_arns`
- Root `outputs.tf` should expose those maps only when observability is enabled.
- Keep existing sensitive `otel_api_key` output as-is unless the implementation intentionally deprecates it in docs. Do not remove it in this story.

**Docs to update:**
- `docs/runbooks/master-runbook.md`: add "OTel SDK configuration from SSM" with exact parameter names and retrieval commands.
- `docs/adr/003-otel-collector-gateway.md`: mention Parameter Store as the distribution mechanism for SDK/client config.
- `terraform.tfvars.example` and env examples: document any new prefix/KMS variables.

**Example client mapping to document:**
- Base/common:
  - `OTEL_EXPORTER_OTLP_ENDPOINT=$(aws ssm get-parameter --name /cloudops/<env>/otel/endpoint --query Parameter.Value --output text)`
  - `OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer <api-key-from-securestring>"`
- OTLP/HTTP signal-specific:
  - `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` reads `/cloudops/<env>/otel/endpoint/metrics`
  - `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` reads `/cloudops/<env>/otel/endpoint/traces`
  - `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` reads `/cloudops/<env>/otel/endpoint/logs`
- Required consumer IAM:
  - `ssm:GetParameter`
  - `ssm:GetParameters`
  - `kms:Decrypt` only if the `api-key` SecureString uses a customer-managed KMS key
- Consumer still needs network reachability to `otel.<domain>`: public ALB with CIDR/WAF controls, or private connectivity when `otel_ingestion_internal=true`.

**Out of scope / do not do:**
- Do not build custom OpenTelemetry SDK wrappers/libraries.
- Do not create per-customer/per-account tokens.
- Do not change the OTel Collector pipelines.
- Do not change Route 53 or ALB ownership.
- Do not replace Secrets Manager or Kubernetes `otel-auth`; SSM is an additional distribution contract for producers.

**Acceptance criteria:**
- `terraform apply` creates all OTel SSM parameters when observability is enabled.
- URL parameters include both the base OTLP endpoint and all three signal-specific OTLP/HTTP paths.
- The OTel bearer token in SSM matches the token mounted into the collector's `otel-auth` Kubernetes Secret and rotates with `otel_token_rotation_days`.
- Terraform state and outputs do not print the token in plaintext beyond the already-sensitive `otel_api_key` output.
- Docs show exact parameter names, expected IAM actions (`ssm:GetParameter`, `ssm:GetParameters`, and KMS decrypt when CMK-backed), and example SDK env vars.
- Custom SDK/library implementation remains out of scope.

---

#### #62 — reduce root-folder clutter without breaking repo entrypoints
**User story:** As a platform operator/developer, I want the repository root to show only the main entrypoints and stable project metadata so I can understand the repo quickly without mixing local scratch files, operational scripts, Terraform roots, generated tool state, and docs.

**Scope boundary:** This is a repo-layout cleanup story. It should move or document files; it should not refactor infrastructure behavior, change deploy semantics, or retire root Terraform unless the layered-stack migration in #16 is already fully validated.

**What exists today:**
- Root still contains legacy/root Terraform entrypoint files: `main.tf`, `variables.tf`, `outputs.tf`, `provider.tf`, `.terraform.lock.hcl`, `terraform.tfvars.example`.
- Root also has operational scripts: `deploy.sh`, `destroy.sh`, `oidc.sh`.
- Root has local-only files/directories such as `terraform.tfvars`, `terraform.dev-backup.tfvars`, `CLAUDE.md`, `.terraform/`, `.claude/`, `.pluralith/`.
- `scripts/`, `stacks/`, `modules/`, `docs/`, `architecture/`, `apps/`, and `environments/` already exist and should be used instead of inventing new top-level folders without a reason.

**What to build:**
- First create an inventory table in the story branch notes or PR description that classifies every root item as: keep in root, move to `scripts/`, move to `docs/`, move to `private/` or leave local-only, generated/tooling directory, or delete only if obsolete and explicitly safe.
- Move operational scripts if references can be updated cleanly:
  - `deploy.sh` → `scripts/deploy.sh`
  - `destroy.sh` → `scripts/destroy.sh`
  - `oidc.sh` → `scripts/oidc.sh`
- Update every reference in README, docs, workflows, helper scripts, and local runbooks. Use `rg` before and after the move.
- Keep root Terraform files in place until #16 is fully resolved and the legacy root module is officially retired. Terraform working directory behavior is easy to break; do not move `main.tf`, `variables.tf`, `outputs.tf`, or `provider.tf` during this story unless the acceptance criteria for #16 are already met and references are updated.
- Keep `.terraform.lock.hcl` in root and tracked. Do not re-ignore it.
- Keep `terraform.tfvars.example` in root unless the docs and CI are changed to use a different template path.
- Do not commit `terraform.tfvars`. If local backup tfvars files are still useful, move them under `private/` or document that they are local-only; otherwise ask before deleting.
- Do not move `CLAUDE.md` unless the local agent workflow is updated at the same time. It is ignored/local but currently acts as the canonical local backlog.
- Update `.gitignore` only if the cleanup introduces a new local/private file location.

**Validation notes:**
- After moving scripts, run syntax checks with Git Bash where possible:
  - `bash -n scripts/deploy.sh`
  - `bash -n scripts/destroy.sh`
  - `bash -n scripts/oidc.sh`
- Run `rg` for old paths (`deploy.sh`, `destroy.sh`, `oidc.sh`) and confirm remaining references are intentional.
- Run `terraform fmt -check -recursive` and `terraform validate` if Terraform files or Terraform references are touched.
- Run `actionlint` if workflows are touched.

**Out of scope / do not do:**
- Do not change infrastructure resources.
- Do not rename modules or stack directories.
- Do not move root Terraform entrypoints before #16 is complete.
- Do not delete local user files unless explicitly requested.
- Do not flatten useful directories just to reduce the visual root count.

**Acceptance criteria:**
- Root folder has fewer mixed-purpose files, with operational scripts moved under `scripts/` or a documented reason they stayed.
- All README/docs/workflow references to moved files are updated.
- Script syntax checks pass for moved shell scripts.
- Terraform root behavior is unchanged.
- No local-only secrets/tfvars are committed.
- `.terraform.lock.hcl` remains tracked in root.

---

#### #78 — storefront design system (CloudOps Dim)
**User story:** As a designer/developer building the storefront, I want a single source of truth for color tokens, typography, spacing, and primitive components so every storefront page looks coherent without re-deciding visual language per route.

**Scope boundary:** Design tokens + base shadcn/ui primitives only. No business pages, no business state, no backend wiring.

**Start files:** `apps/storefront/tailwind.config.ts`, `apps/storefront/src/styles/tokens.css`, `apps/storefront/src/styles/globals.css`, `apps/storefront/src/components/ui/*`, `apps/storefront/src/app/design/page.tsx` (internal preview at `/design`, env-gated; underscore-prefixed folder rejected because App Router treats `_*` as private and never serves the route).

**Implementation notes:**
- Tailwind v4 config exposing the "cloudops-dim" palette as theme keys: `bg.base #1c2128`, `bg.raised #22272e`, `bg.elev #2d333b`, `border.default #444c56`, `border.muted #373e47`, `fg.base #cdd9e5`, `fg.muted #909dab`, `fg.subtle #687480`, `fg.invert #1c2128`, `brand.500 #2dd4bf`, `brand.400 #5eead4`, `brand.600 #14b8a6`, `success #57ab5a`, `warning #c69026`, `danger #e5534b`, `info #539bf5`.
- Same tokens emitted as CSS custom properties in `:root` of `globals.css` so non-Tailwind code paths (server-rendered email, third-party embeds) can reuse them.
- Typography: Inter for UI, JetBrains Mono for SKUs/order IDs/prices/code. Self-hosted via `next/font/google` with `display: 'swap'`. Heading scale 32/24/20/16/14, body 14 default, 16 reading.
- Border-radius scale `sm 4 / md 6 / lg 8 / xl 12` — default `lg` for cards, `md` for buttons, `sm` for inputs.
- Focus ring is `2px brand.500 / 60% opacity` everywhere; never browser default.
- Dark-only theme. No light theme switcher in v1; `prefers-color-scheme` is ignored. Documented as an explicit decision so a future contributor does not "fix" it.
- shadcn/ui primitives are copied into the repo (not depended on) so updates are reviewable: button, card, input, label, dialog, dropdown-menu, badge, status-pill (custom variant: `live` with pulsing dot), toast, table, skeleton, separator, scroll-area, tabs.
- `design/page.tsx` renders every primitive in every variant for visual QA at `/design`. Gated by `process.env.NEXT_PUBLIC_DESIGN_PREVIEW === '1'` (returns 404 via `notFound()` when unset) so it never ships in a normal prod build.
- WCAG AA contrast verified at design time and asserted in a unit test that loads `tokens.css` and computes ratios for each fg/bg pair.

**Acceptance criteria:**
- `npm run build` in `apps/storefront` produces a static design preview page with `NEXT_PUBLIC_DESIGN_PREVIEW=1`.
- Lighthouse contrast audit passes AA on the preview page.
- All tokens exposed both as CSS custom properties and Tailwind theme keys.
- No hardcoded color hex literals in any component file outside `tokens.css`.
- Component files have zero business logic — they are pure visual primitives.
- Storybook is intentionally NOT introduced; the `_design` route is the substitute.

---

#### #79 — Next.js storefront skeleton on EKS
**User story:** As a platform operator, I want a Next.js storefront app deployed in EKS that mirrors order-api's platform contract (probes, IRSA, NetworkPolicy, OTel, Gatekeeper, PSS-restricted) so it inherits all existing prod-shaped guarantees without new infra.

**Scope boundary:** Skeleton only. No auth, no backends connected. The home page is a placeholder that links to `_design` in dev. Probes and observability hooks are wired.

**Start files:** `apps/storefront/{Dockerfile,package.json,tsconfig.json,eslint.config.js,next.config.ts}`, `apps/storefront/src/app/{layout.tsx,page.tsx,api/health/route.ts,api/ready/route.ts}`, `apps/storefront/k8s/{deployment.yaml,service.yaml,ingress.yaml,namespace.yaml,networkpolicy.yaml,hpa.yaml,pdb.yaml,serviceaccount.yaml,servicemonitor.yaml}`, `apps/storefront/scripts/{contract-check.ts,render-k8s.ts}` (adapted from order-api versions), `.github/workflows/app.yml` (matrix expanded for storefront), `scripts/validate-k8s-manifests.sh` (renders both apps' k8s).

**Implementation notes:**
- Next.js 15 App Router, `output: 'standalone'`. Dockerfile mirrors order-api's three-stage layout (`builder` → `prod-deps` → `runtime`). Runs as UID 1001, runAsNonRoot, readOnlyRootFilesystem with writable `/tmp` emptyDir, drops ALL caps, RuntimeDefault seccomp.
- `src/app/api/health/route.ts` returns `{status:'ok'}` for k8s liveness. `src/app/api/ready/route.ts` is a no-op for now; it gains a JWKS-reachability check in #80.
- Manifests follow the order-api `render-k8s.ts` + `contract-check.ts` pattern. Initial env vars: `NODE_ENV`, `PORT=3000`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_SERVICE_NAME=storefront`. Contract check enforces every `process.env.X` in src is in `deployment.yaml`.
- Ingress uses `alb.ingress.kubernetes.io/group.name = cloudops`, `group.order = 20`, `ssl-redirect = 443`. Hostname is the root domain from tfvars.
- NetworkPolicy: default-deny ingress + default-deny egress, allow ingress from VPC CIDR on 3000, allow egress to DNS, AWS APIs (443), and OTel collector in `monitoring` namespace on 4317.
- Namespace `storefront` carries `pod-security.kubernetes.io/{enforce,audit,warn}: restricted` + `*-version: latest`.
- ServiceMonitor scrapes `/metrics` on port 9090 (mirrors order-api separate metrics-server pattern; metrics route can be a stub initially).
- Image refs in manifests are `@sha256:<digest>` placeholders; CI substitutes via the existing pipeline.
- ECR pull-through cache used for any public images via the existing `ecr-public/` prefix.
- `app.yml` extended: matrix entry `app: [order-api, storefront]` for build/sign/scan/render/deploy. Manifest validation runs for both.
- `scripts/validate-k8s-manifests.sh` extended to render and kubeconform both `apps/order-api/k8s` and `apps/storefront/k8s`.

**Acceptance criteria:**
- Storefront pod admits under PSS-restricted; Gatekeeper does not reject.
- ALB Ingress group `cloudops` resolves storefront at the root domain and order-api at `api.<domain>` from the same ALB.
- `kubectl get servicemonitor -n storefront` returns the manifest; Prometheus scrapes `/metrics`.
- `npm run contract-check` in `apps/storefront` passes.
- `scripts/validate-k8s-manifests.sh` returns "valid" for both apps.
- Coverage gates exist for storefront (initial threshold can be lower than order-api; documented in `docs/coverage-gates.md`).

---

#### #80 — Cognito User Pool + storefront auth integration
**User story:** As a customer using the storefront, I want to sign up, log in, and stay logged in across pages, with the same JWT enforced by order-api so my tenant identity is consistent everywhere.

**Scope boundary:** Cognito provisioning + storefront login/callback + JWT cookie verification. order-api auth code only changes env values, not logic.

**Start files:** `modules/auth/{cognito.tf,outputs.tf,variables.tf}`, `stacks/platform/main.tf` (wire module), `stacks/platform/outputs.tf` (export pool ID, app client ID, hosted UI domain, JWKS URL), `apps/storefront/src/middleware.ts`, `apps/storefront/src/app/login/page.tsx`, `apps/storefront/src/app/auth/callback/route.ts`, `apps/storefront/src/lib/auth.ts`, `apps/storefront/src/app/api/ready/route.ts` (extend), `apps/storefront/k8s/deployment.yaml` (add Cognito env vars), `.github/workflows/app.yml` (storefront deploy reads new secrets), `apps/order-api/k8s/deployment.yaml` (`OIDC_*` vars now Cognito-shaped via secrets), `apps/order-api/src/app.ts` (extend `requireTenant` to read `custom:tenant_id`).

**Implementation notes:**
- `aws_cognito_user_pool` with email-only signup, password policy (min 12, mixed/numbers/symbols), email verification via SES, MFA optional in dev / required-software in prod, custom attribute `tenant_id` (string, mutable=false, required=true).
- `aws_cognito_user_pool_client` "storefront" with PKCE, no client secret, callback URL `https://<domain>/auth/callback`, logout URL `https://<domain>/`, token validity (id 60min, access 60min, refresh 30d), `ALLOWED_OAUTH_FLOWS=code`, scopes `openid email profile`.
- `aws_cognito_user_pool_domain` custom domain `auth.<domain>` (uses ACM + Route 53 records — pattern reused from existing ingress module).
- Storefront middleware uses `jose` (`createRemoteJWKSet` for cached JWKS lookup + `jwtVerify` for offline verify). Public routes whitelist: `/`, `/products*`, `/login`, `/auth/callback`, `/_next/*`, `/api/health`, `/api/ready`. Protected routes (`/cart`, `/checkout`, `/orders*`, `/admin*`) redirect unauth users to `/login?next=<path>`.
- Login flow: `/login` server component redirects to Cognito Hosted UI authorize URL with `state` + PKCE challenge stored in a short-lived HttpOnly cookie. `/auth/callback` exchanges code for tokens, sets `cloudops_session` cookie (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, expiry matches id_token), redirects to the `next` parameter or `/`.
- order-api integration: `OIDC_ISSUER=https://cognito-idp.<region>.amazonaws.com/<pool-id>`, `OIDC_JWKS_URL=<issuer>/.well-known/jwks.json`, `OIDC_AUDIENCE=<app-client-id>`, `OIDC_REQUIRED_SCOPES=openid`. Existing `auth-jwt.ts` works unchanged.
- `requireTenant` middleware extended to read `custom:tenant_id` in addition to `tenant_id` (Cognito uses the `custom:` prefix on user-defined attributes).
- API key path remains in dev/test only. Staging/prod fail-closed enforcement (#22 + #37) is unchanged.

**Acceptance criteria:**
- A new user can sign up via Hosted UI, sets `custom:tenant_id`, logs in, lands on `/`.
- Visiting `/cart` while logged out redirects to `/login`; after login, returns to `/cart`.
- Storefront server-side fetch to `api.<domain>/orders` includes the `cloudops_session` token; order-api authenticates and scopes to `custom:tenant_id`.
- `kubectl rollout status deployment/storefront -n storefront` succeeds with new env vars.
- `apps/order-api/test/auth-jwt.test.ts` extended with a Cognito-shaped token fixture and continues to pass.
- Storefront `/api/ready` returns 200 only when Cognito JWKS is reachable.

---

#### #81 — products schema + Postgres FTS + Express product routes
**User story:** As a backend owner, I want a tenant-scoped products table with full-text search built into RDS so the storefront can list, detail, and search products without adding a separate search engine.

**Scope boundary:** Database schema + Express routes only. Lambda search-gateway lives in #82.

**Start files:** `apps/order-api/migrations/006_products.sql`, `apps/order-api/src/app.ts` (extend), `apps/order-api/scripts/seed-products.ts`, `apps/order-api/test/products.test.ts`, `apps/order-api/openapi.yaml` (extend).

**Implementation notes:**
- Migration `006_products.sql` creates `products` with columns: `id BIGSERIAL PRIMARY KEY`, `tenant_id VARCHAR(64) NOT NULL` (CHECK matches the existing `^[a-zA-Z0-9_-]{1,64}$` pattern), `sku VARCHAR(64) NOT NULL`, `name TEXT NOT NULL`, `description TEXT`, `price_cents BIGINT NOT NULL CHECK (price_cents >= 0)`, `qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0)`, `image_key TEXT`, `is_active BOOLEAN NOT NULL DEFAULT true`, `search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,'') || ' ' || coalesce(sku,''))) STORED`, `created_at`, `updated_at`. Unique index `(tenant_id, sku)`. GIN index on `search_tsv`. Composite index `(tenant_id, is_active, created_at DESC)`.
- RLS: enable + force on `products`, policy `tenant_isolation_products` matching `current_setting('app.tenant_id')` on USING + WITH CHECK. Defence-in-depth `WHERE tenant_id` clauses kept in Express.
- Public-read routes: `GET /products` (paginated with `?limit=20&cursor=<base64>`) and `GET /products/:id`, both tenant-scoped via the existing `withTenant` helper.
- HMAC-gated routes mounted under a separate router: `POST /_internal/search` runs the FTS query (`SELECT id, sku, name, price_cents, qty, image_key, ts_rank_cd(search_tsv, query) AS rank FROM products, plainto_tsquery('english', $1) query WHERE search_tsv @@ query AND is_active = true ORDER BY rank DESC, created_at DESC LIMIT $2`), and `POST/PUT/DELETE /_internal/admin/products` for catalog CRUD.
- HMAC middleware validates `X-CloudOps-HMAC` (sha256 over `timestamp + nonce + raw body` keyed by `INTERNAL_HMAC_SECRET`). Secret is sourced from Secrets Manager via External Secrets and rotated per the existing pattern.
- Seed script ships 50 sample products across 3 tenants for demo realism.
- OpenAPI spec extended with the new public routes; `_internal/*` routes intentionally not published.

**Acceptance criteria:**
- Migration applied; `\d products` shows GIN index on `search_tsv`.
- `GET /products` returns 20 items per page, paginated with cursor.
- Cross-tenant FTS leak test passes: tenant A search returns 0 results when only tenant B products exist.
- HMAC missing or wrong on `_internal/*` returns 401.
- 100/85/90 coverage gate still passes.
- `npm run openapi:lint` passes.

---

#### #82 — search Lambda + API GW HTTP + VPC Link
**User story:** As a storefront frontend, I want to call a single public search endpoint at `search.<domain>` that returns scoped, ranked product results with sub-50ms cache hits so the catalog page feels instant without exposing the cluster directly.

**Scope boundary:** Public read path for search only. No write path, no admin path, no other catalog endpoints.

**Start files:** `modules/storefront-search/{api_gateway.tf,lambda.tf,vpc_link.tf,iam.tf,variables.tf,outputs.tf}`, `modules/storefront-search/lambda_function/{index.ts,package.json,tsconfig.json}`, `stacks/platform/main.tf` (wire module), `scripts/build-lambdas.sh` (extend to build the TS Lambda), `apps/storefront/src/lib/api.ts` (point at `search.<domain>`).

**Implementation notes:**
- API Gateway HTTP API (`aws_apigatewayv2_api`) with custom domain `search.<domain>`, ACM cert, Route 53 alias.
- Routes: `GET /search`, optional `GET /products/{id}` (cache layer for product detail).
- Authorizer: JWT authorizer pointing at the Cognito issuer; required scope `openid`. API GW passes claims through to the Lambda.
- VPC Link: `aws_apigatewayv2_vpc_link` with private subnets; integration `aws_apigatewayv2_integration` of type `AWS_PROXY` (Lambda) — the Lambda makes the in-VPC call to Express, not API GW directly. This keeps the cache and HMAC signing inside Lambda where the trust boundary lives.
- Lambda `search-gateway`: Node 22 runtime, ARM64, 256MB. Verifies Cognito JWT (extracted from authorizer claims), resolves `tenant_id` from `custom:tenant_id`, injects into `_internal/search` POST body. In-memory LRU cache (size 500, TTL 60s) keyed by `tenant#q#cursor`. HMAC signing uses a secret pulled from SSM Parameter Store on cold start, cached for the warm window.
- Express target: `http://order-api.cloudops.svc.cluster.local:3000/_internal/search`. Resolved via the in-VPC NLB → Service path; NetworkPolicy on order-api allows ingress only from the storefront SG and the Lambda subnet.
- IAM: Lambda role has `ssm:GetParameter` on `/cloudops/<env>/search-gateway/hmac-secret` only.
- OTel ADOT layer attached; `OTEL_RESOURCE_ATTRIBUTES=service.name=search-gateway`.
- Cold-start budget: < 500ms warm, < 1.2s cold. Provisioned concurrency optional via var, off by default.

**Acceptance criteria:**
- `GET https://search.<domain>/search?q=widget` with a valid JWT returns ranked results within 100ms warm.
- Same query within cache TTL returns cache HIT (verified via `X-Cache: HIT` header set by the Lambda).
- Cross-tenant test passes: tenant A token cannot retrieve tenant B's products.
- Lambda traces appear in Tempo, parented under the storefront RSC trace via `traceparent` header.
- HMAC validation fails closed on rotation; old cache entries are not served past TTL.

---

#### #83 — storefront product list + detail pages
**User story:** As a customer, I want a fast, scannable product catalog and detail page so I can find what I want and click to buy.

**Scope boundary:** Read-only browsing UI. No cart actions yet (AddToCartButton is rendered disabled).

**Start files:** `apps/storefront/src/app/products/{page.tsx,loading.tsx,error.tsx}`, `apps/storefront/src/app/products/[slug]/{page.tsx,loading.tsx,error.tsx}`, `apps/storefront/src/components/{ProductCard.tsx,ProductGrid.tsx,SearchBar.tsx,Filters.tsx,Pagination.tsx,ProductDetail.tsx,AddToCartButton.tsx}`, `apps/storefront/src/lib/api.ts` (extend).

**Implementation notes:**
- `/products?q=&min=&max=&inStock=&cursor=` is an RSC page. When `q` is set, it calls `searchProducts()` (hits `search.<domain>`); otherwise it calls `GET api.<domain>/products` for the default catalog.
- Grid: 4 columns desktop, 2 tablet, 1 mobile. Each card uses `ProductCard` from the design system: image (S3+CloudFront, lazy with `next/image`), name, price formatted via `Intl.NumberFormat`, stock badge (`in-stock`/`low-stock`/`out-of-stock`).
- Search bar at top is a client component, debounced 300ms; navigates with new query string via `router.replace`. RSC re-fetches automatically on the new URL.
- Filters sidebar: price min/max range, in-stock checkbox; both sync to URL params.
- Cursor pagination: numbered pages or "Load more". Initial implementation is "Load more".
- `/products/[slug]` is an RSC page that fetches `GET api.<domain>/products/:id`. Renders a large image, the `name`, the `description` (markdown via `marked`, sanitized), the price, a qty selector, and `<AddToCartButton/>` (disabled in this story; wired in #84).
- Loading states use `Skeleton` from the design system.
- Error states render the design-system error component with a "Retry" link.
- Empty state: "No products match" with a reset link.
- Image placeholders use `bg.elev` with a muted icon — never harsh "missing" gray.

**Acceptance criteria:**
- Lighthouse on `/products` ≥ 90 perf, ≥ 95 a11y.
- Zero client JS for non-interactive parts (verified: card content is RSC).
- Navigating with a search query rebuilds the page server-side (visible in Network tab as RSC payload).
- Out-of-stock products show muted card + disabled CTA.
- All hex colors in components reference Tailwind theme keys, not literals.

---

#### #84 — DynamoDB cart + cart page
**User story:** As a shopper, I want a cart that persists across sessions and devices so I don't lose items between visits.

**Scope boundary:** Cart CRUD via DynamoDB. Inventory reservation lives in #87.

**Start files:** `modules/storefront-cart/{dynamodb.tf,iam.tf,variables.tf,outputs.tf}`, `stacks/platform/main.tf` (wire module), `apps/storefront/src/app/cart/{page.tsx,loading.tsx}`, `apps/storefront/src/app/api/cart/{route.ts,[itemId]/route.ts}`, `apps/storefront/src/lib/cart.ts`, `apps/storefront/src/components/{CartView.tsx,CartItem.tsx,CartIcon.tsx}`, `apps/storefront/src/components/AddToCartButton.tsx` (wire), `apps/storefront/k8s/serviceaccount.yaml` (IRSA annotation), `apps/storefront/k8s/deployment.yaml` (env vars), `apps/storefront/src/app/products/[slug]/page.tsx` (enable button).

**Implementation notes:**
- Terraform module `modules/storefront-cart` provisions DynamoDB `cloudops-cart-<env>` on-demand mode, PK=`pk` (S), SK=`sk` (S), TTL attribute `expires_at` (number). Schema: `pk = "TENANT#<tenant>#USER#<sub>"` (or `GUEST#<anonId>` for unauth), `sk = "ITEM#<sku>"`, attrs `qty`, `price_cents_at_add`, `name_at_add`, `added_at`, `expires_at` (added_at + 7d).
- IAM policy doc with `dynamodb:GetItem/PutItem/UpdateItem/DeleteItem/Query/BatchWriteItem` on the table ARN only. IRSA role `cloudops-storefront-cart` trusted by the storefront SA in the `storefront` namespace.
- Storefront `lib/cart.ts` exports `getCart(userKey)`, `addToCart(userKey, item)` (UpdateItem with `ADD qty :one` semantics, and a snapshot of price/name fetched from `/products/:id` to render the cart with stable values), `removeFromCart`, `updateQty` (deletes when qty=0), `mergeGuestCart(guestKey, userKey)` (BatchWriteItem on login).
- Next.js API routes: `GET /api/cart`, `POST /api/cart` (`{sku, qty}`), `PATCH /api/cart/[itemId]`, `DELETE /api/cart/[itemId]`. User key resolved server-side from middleware-set request header; never trusted from client.
- `/cart` page: RSC fetches initial cart server-side; client island handles qty controls + remove (optimistic via TanStack Query, falls back on error).
- CartIcon in nav: client component, polls `/api/cart` count via TanStack Query (staleTime 30s). Replaceable with WS push later.
- Anonymous (guest) cart: cookie `cloudops_guest_id` (UUID, HttpOnly, 30d). Merged on login via `auth/callback` calling `mergeGuestCart`.

**Acceptance criteria:**
- Adding an item from `/products/[slug]` persists across page reload.
- Logging out and back in preserves the cart (when logged in originally).
- Logging in as a guest with items merges them under the user's key.
- Anonymous cart auto-expires via Dynamo TTL after 7 days (verified by setting `expires_at` to past and running `aws dynamodb scan`).
- IRSA boundary: a pod with the storefront SA can RW only this table; a pod with the order-api SA cannot (verified by `aws sts get-caller-identity` from each pod).
- Cart UI initial render < 500ms RSC.

---

#### #85 — Kinesis stream + Express order event publisher
**User story:** As a platform owner, I want every order state change to land on a durable, replayable event stream so realtime fanout, audit archival, and analytics can all consume from the same source of truth.

**Scope boundary:** Stream provisioning + Express publish call. Consumers (WS fanout, audit archive) live in #86 and beyond.

**Start files:** `modules/storefront-events/{kinesis.tf,iam.tf,variables.tf,outputs.tf}`, `stacks/platform/main.tf` (wire module), `apps/order-api/src/kinesis.ts`, `apps/order-api/src/app.ts` (integration), `apps/order-api/k8s/{deployment.yaml,migration-job.yaml}` (env), `apps/order-api/test/kinesis.test.ts`, `modules/observability/yace.tf` (extend namespaces).

**Implementation notes:**
- Kinesis Data Stream `orders-events-<env>` ON-DEMAND mode (no shard count). KMS-encrypted via the existing observability/data KMS pattern. Retention configurable: 24h dev, 7d staging+prod (var `events_stream_retention_hours`).
- IAM: order-api IRSA gains `kinesis:PutRecord`/`PutRecords` on the stream ARN only. Resource scoping is strict.
- `apps/order-api/src/kinesis.ts`: lazy `KinesisClient` init, `publishOrderEvent({tenantId, orderId, type, payload})`. Partition key = `tenantId` (preserves per-tenant ordering). Data = JSON-encoded `{schema_version: 1, type, tenant_id, order_id, payload, ts}`. Retry once on `ProvisionedThroughputExceededException` with backoff. On final failure, write a row to `audit_events` with `result='kinesis_publish_failed'` so the event is not lost silently.
- Integration in `app.ts`: after `withTenant` commit on `POST /order`, call `publishOrderEvent({type: 'order.created', ...})`. Deliberately outside the txn (post-commit) — a Kinesis outage must never roll back the order.
- Tests stub the Kinesis client and assert partition key + payload shape; failure path test asserts `audit_events.result='kinesis_publish_failed'` row written.
- yace scrape config extended to include `AWS/Kinesis` namespace so `IteratorAgeMilliseconds` flows into Prometheus.

**Acceptance criteria:**
- `POST /order` produces a Kinesis record visible via `aws kinesis get-records`.
- NetworkPolicy on order-api egress allows AWS API on 443 (already allowed under the AWS APIs rule).
- Stream has KMS encryption enabled.
- Coverage gate still passes.
- New PrometheusRule `kinesis-iterator-age` (added in #89, scaffolded here) warns at 60s lag and pages at 5min.

---

#### #86 — API Gateway WebSocket + connection registry + fanout Lambda
**User story:** As a customer watching my order, I want the order detail page to update in realtime when my order's status changes so I don't have to refresh.

**Scope boundary:** WebSocket plumbing + Kinesis-to-WS fanout + storefront order detail UI hookup.

**Start files:** `modules/storefront-realtime/{ws_api.tf,lambda_connect.tf,lambda_disconnect.tf,lambda_fanout.tf,dynamodb_connections.tf,iam.tf,variables.tf,outputs.tf}`, `modules/storefront-realtime/lambdas/{connect,disconnect,fanout}/{index.ts,package.json,tsconfig.json}`, `stacks/platform/main.tf` (wire module), `apps/storefront/src/lib/ws.ts`, `apps/storefront/src/components/OrderStatusPill.tsx`, `apps/storefront/src/components/AuditTrail.tsx`, `apps/storefront/src/app/orders/[id]/page.tsx`, `apps/storefront/src/app/orders/page.tsx`, `apps/storefront/src/app/api/ws-token/route.ts`.

**Implementation notes:**
- API Gateway WebSocket API with custom domain `ws.<domain>`, ACM cert, Route 53 alias. Routes `$connect`, `$disconnect`, `$default`.
- `$connect` Lambda extracts a short-lived JWT from `Sec-WebSocket-Protocol` (or query string `?token=` as a fallback). Verifies via Cognito JWKS. Writes `{connId, tenantId, sub, expires_at}` to Dynamo. Rejects on missing/invalid token (returns non-2xx → API GW closes the WS).
- `$disconnect` Lambda removes the row by `connId`.
- `$default` Lambda is a no-op for now (could handle ping later).
- Dynamo `cloudops-ws-connections-<env>`: PK=`connId`, GSI `by-tenant` (PK=`tenantId`, SK=`connId`), TTL `expires_at` 24h.
- `ws-fanout` Lambda is a Kinesis consumer (event source mapping, batch size 100, max batching window 1s, `BisectBatchOnFunctionError=true`, parallelization factor 2). For each event, queries Dynamo GSI `by-tenant` for connections in that tenant. For each connection, calls `apigatewaymanagementapi:PostToConnection`. On 410 Gone, deletes the stale connection. On any non-410 error, sends to a DLQ (SQS).
- IAM: connect Lambda has `dynamodb:PutItem`; disconnect has `dynamodb:DeleteItem`; fanout has `dynamodb:Query` on GSI, `dynamodb:DeleteItem`, `execute-api:ManageConnections`. Kinesis read perms managed by the event source mapping.
- Storefront `lib/ws.ts` exports `useOrderUpdates(orderId)`: opens WS, sets `Sec-WebSocket-Protocol` to `cloudops, <token>`. On message, dispatches to React state. Reconnects with exponential backoff up to 30s; UI shows a "reconnecting" state.
- Token issuance: client calls `/api/ws-token` server route which mints a 5-minute-validity JWT signed with a Lambda-shared secret (or proxies a Cognito-issued short-lived token).
- `/orders` (RSC): lists user's orders for current tenant via `api.<domain>/orders`.
- `/orders/[id]`: RSC shell with order data from `api.<domain>/orders/:id`. Client island `<LiveStatus orderId={id}/>` mounts WS via the hook and replaces the status pill on event. Audit trail panel below shows `audit_events` rows (RSC fetched).

**Acceptance criteria:**
- Open `/orders/[id]` in browser, post a status change to Kinesis manually (`aws kinesis put-record`); the pill updates without refresh in < 2s.
- Cross-tenant test: tenant A's WS does not receive tenant B's events (verified by 2-tab integration test in `app.yml`).
- Reconnection works after `kubectl rollout restart` of any pod.
- Stale connections (closed without `$disconnect`) are pruned on next publish via the 410 handler.
- Fanout Lambda DLQ remains empty on healthy demo.

---

#### #87 — Step Functions checkout saga + checkout page
**User story:** As a shopper, I want to complete a checkout that reserves inventory, creates the order, sends a confirmation email, and rolls back cleanly on failure so I'm never charged for items I don't get.

**Scope boundary:** State machine + checkout UI + email Lambda. Payment is stubbed (no Stripe in this story).

**Start files:** `modules/storefront-checkout/{step_functions.tf,lambda_email.tf,sqs_email.tf,iam.tf,variables.tf,outputs.tf}`, `modules/storefront-checkout/state_machine.asl.json`, `modules/storefront-checkout/lambdas/email/{index.ts,package.json,tsconfig.json}`, `apps/storefront/src/app/checkout/{page.tsx,success/page.tsx}`, `apps/storefront/src/app/api/checkout/route.ts`, `apps/order-api/src/app.ts` (extend `POST /order` to honor incoming `Idempotency-Key` from upstream — already supports via #72; also add `PATCH /order/:id` to mark cancelled), `stacks/platform/main.tf` (wire module).

**Implementation notes:**
- State machine `cloudops-checkout-<env>` (Standard, not Express — durable, visible execution history is a demo asset).
- States:
  - `ReserveInventory` (HTTP task to Express `_internal/admin/products` PATCH per item, atomic dec via `WHERE qty >= :req`). Returns reservation list.
  - `CreateOrder` (HTTP task via `arn:aws:states:::http:invoke` with EventBridge connection): POST `https://api.<domain>/order` with `Idempotency-Key` set to the SF execution name, body = items + total + tenant.
  - `PublishEvent` is implicit: Express publishes `order.created` via #85 inside its own write path.
  - `EnqueueEmail` (SQS SendMessage) → email queue → email Lambda → SES.
  - `Success` end state.
  - Each task has a `Catch` to a `Compensate` branch: refund inventory via inverse PATCH, mark order cancelled via `PATCH /order/:id`, publish `order.cancelled` via Express helper.
- Email Lambda: SQS trigger; renders an order-confirmation email (HTML + text) using a template literal; SES `SendEmail` to the user's verified Cognito email.
- Storefront `/checkout`: RSC fetches the cart, validates non-empty, computes the total. Server Action `submitCheckout` starts an SF execution via `StartExecution` with execution name = idempotency key derived from `(user, cart_hash)`. Redirects to `/checkout/success?executionId=<arn>`.
- `/checkout/success`: RSC polls via `DescribeExecution` until the status is terminal. On `SUCCEEDED`, links to `/orders/:id` for live tracking. On `FAILED`, shows compensation status and a "what happened" detail panel.
- IAM: storefront IRSA gains `states:StartExecution`/`DescribeExecution` on this state machine ARN only.
- yace scrapes `AWS/States` for execution failure rate (consumed by #89).

**Acceptance criteria:**
- Happy path: checkout completes, the order appears in `/orders`, email arrives via SES sandbox in dev.
- Inventory rollback: forcing `CreateOrder` to fail (e.g., temporarily kill the order-api pod) makes SF compensate inventory; `aws stepfunctions describe-execution` shows the compensate path.
- Idempotency: starting two SF executions with the same execution name returns the same execution.
- Cross-tenant block: a user from tenant A cannot start a checkout for items belonging to tenant B (validated server-side in the checkout API route).
- SF console graph renders all states.
- Coverage gate still passes.

---

#### #88 — S3+CloudFront assets + image-resize Lambda + admin uploader
**User story:** As an admin, I want to upload product images and have multiple sizes auto-generated and served via CDN so storefront pages stay fast and bandwidth costs stay low.

**Scope boundary:** Asset bucket + CDN + resize Lambda + admin upload UI. Admin auth uses the Cognito group `admin`.

**Start files:** `modules/storefront-assets/{s3.tf,cloudfront.tf,lambda_resize.tf,iam.tf,variables.tf,outputs.tf}`, `modules/storefront-assets/lambda/resize/{index.ts,package.json,tsconfig.json}` (uses `sharp`), `apps/storefront/src/app/admin/{layout.tsx,page.tsx,products/page.tsx,products/new/page.tsx,upload/page.tsx}`, `apps/storefront/src/app/api/admin/upload/route.ts`, `apps/storefront/src/components/admin/{ProductForm.tsx,ImageUploader.tsx}`, `apps/order-api/src/app.ts` (extend `_internal/admin/products` PUT with `image_key`), `stacks/platform/main.tf` (wire module).

**Implementation notes:**
- S3 bucket `cloudops-assets-<env>`: versioning on, lifecycle expiration off (assets are durable), KMS-encrypted via existing pattern. Object Ownership: BucketOwnerEnforced. Public access blocked. Reads only via CloudFront with OAC. CORS allows PUT from `https://<domain>` for direct browser upload.
- CloudFront distribution at `assets.<domain>`: origin S3 with OAC (modern OAI replacement). Cache policy: long TTL (1 year), versioned via `?v=<image_version>` query string. Default behavior: GET only, HTTPS only, response headers policy with strict CSP.
- `image-resize` Lambda: S3 PUT trigger on `originals/` prefix. Uses `sharp` (Node 22 Lambda layer or in deployment package, ARM64). Generates 3 sizes — `sm` (320), `md` (640), `lg` (1280) — under `resized/<size>/<key>`. Sets metadata `Cache-Control: public, max-age=31536000, immutable`. Skips non-image content-types. On failure, writes to a DLQ (SQS).
- Admin auth: Cognito group `admin`. Storefront middleware checks for group membership in the JWT before allowing `/admin/*`.
- `/admin` landing with link to product management.
- `/admin/products` lists with edit links; `/admin/products/new` shows the create form.
- `/admin/upload` is a drop zone that requests a presigned URL, PUTs the file directly to S3 `originals/`, polls for resized variants, shows preview.
- API route `/api/admin/upload` is server-only: verifies admin group, generates a content-type-restricted presigned PUT URL (`Content-Type: image/png|image/jpeg|image/webp`, max 10MB), returns `{url, fields, key}`.

**Acceptance criteria:**
- Admin uploads a 4K image; the Lambda resizes to 3 sizes within 5s; all variants are accessible via `https://assets.<domain>/resized/sm/<key>` with correct cache headers.
- Non-admin users cannot reach `/admin/*` (redirected by middleware).
- S3 bucket policy denies all anonymous reads (curl direct → 403); CloudFront serves the same key (200).
- DLQ stays empty on healthy uploads.
- Idle cost for CloudFront + S3 between demos is essentially $0.

---

#### #89 — storefront observability + Grafana dashboard
**User story:** As an SRE, I want a single Grafana dashboard that shows the storefront's full request path (browser → Next.js → search/order/cart APIs → DB → events → WS) with SLOs, errors, and infra health so I can debug issues in one place.

**Scope boundary:** OTel wiring + dashboard + alerts. No new app code beyond the OTel SDK init.

**Start files:** `modules/observability/dashboards/storefront.json`, `modules/observability/grafana_native_alerts.tf` (extend), `modules/observability/yace.tf` (extend namespaces), `apps/storefront/src/lib/otel.ts`, `apps/storefront/src/app/layout.tsx` (instrument), `apps/storefront/src/middleware.ts` (instrument), `modules/storefront-realtime/lambdas/*/index.ts` (ADOT layer), `modules/storefront-checkout/lambdas/email/index.ts` (ADOT), `modules/storefront-search/lambda_function/index.ts` (already includes ADOT from #82).

**Implementation notes:**
- `@vercel/otel` in storefront with `OTEL_EXPORTER_OTLP_ENDPOINT` from existing observability SSM parameters (#61 work).
- `traceparent` propagation: storefront → API GW (X-Ray header conversion) → Lambdas → order-api → RDS via `pg-otel`.
- ADOT Lambda layer attached to all 6 storefront Lambdas (search-gateway, ws-connect, ws-disconnect, ws-fanout, image-resize, order-email).
- Grafana dashboard `cloudops-storefront`:
  - Row 1: SLOs — checkout success rate (target 99%), search latency p95 (target < 200ms), WS connection success rate (target 99%).
  - Row 2: storefront RSC duration p50/p95/p99, server action error rate, `/products` vs `/orders` traffic split.
  - Row 3: search-gateway cache hit rate, p95 latency, error rate.
  - Row 4: WS active connections (gauge), `$connect` failures, fanout Lambda errors, Kinesis `IteratorAgeMilliseconds`.
  - Row 5: SF executions by status (stacked timeseries), execution duration p95, compensation rate (failed/total).
  - Row 6: Cognito sign-in success rate, MFA challenges (placeholder until MFA enabled).
  - Row 7: CloudFront 4xx/5xx rate, cache hit ratio, origin latency.
  - Row 8: cart Dynamo throttles, consumed RCU/WCU.
- New PrometheusRules:
  - `WSFanoutErrorHigh` — fanout Lambda error rate > 1% for 5 min.
  - `KinesisLagHigh` — `aws_kinesis_iterator_age_milliseconds > 60000` for 5 min (warn), `> 300000` 5 min (crit).
  - `SFExecutionFailureHigh` — `FailedExecutions > 5%` for 10 min.
  - `CheckoutSLOBudgetBurn` — multi-window burn rate on checkout success rate matching the existing SLO pattern.
- yace scrape config extended with `AWS/States`, `AWS/Kinesis`, `AWS/ApiGateway`, `AWS/CloudFront`, `AWS/Cognito`. ServiceMonitor labels remain `release: prometheus`.

**Acceptance criteria:**
- A checkout from `/products` to `/orders/:id` produces a single trace in Tempo spanning browser → Next.js → API GW → Lambda → Express → RDS → Kinesis → Lambda → WS.
- Dashboard renders all panels with data within 2 minutes of activity.
- Fast-burn alert fires when checkout success drops below 95% in test (verified by injecting failures via SF input).
- No new Grafana sidecar reload errors.
- Existing SLO + CW alert rules still load.

---

#### #90 — storefront ADRs + master runbook updates
**User story:** As a future maintainer, I want each non-trivial storefront architectural decision documented in an ADR plus a master runbook section that explains how to bring up and tear down the full demo stack.

**Scope boundary:** Documentation only. No code or infra changes.

**Start files:** `docs/adr/016-cognito-over-auth0.md`, `docs/adr/017-lambda-eks-hybrid-search.md`, `docs/adr/018-apigw-websocket-over-appsync.md`, `docs/adr/019-step-functions-checkout-saga.md`, `docs/adr/020-nextjs-on-eks-over-lambda-edge.md`, `docs/runbooks/master-runbook.md` (extend), `docs/runbooks/demo-bringup.md`, `docs/runbooks/demo-teardown.md`, `README.md` (link new ADRs), `scripts/destroy.sh` (extend to handle new resources).

**Implementation notes:**
- ADR-016: Cognito vs Auth0/Clerk vs roll-your-own. Decision: Cognito. Rationale: AWS-native, free under 50k MAU, hosted UI, slots into the existing `auth-jwt.ts` with no code change, matches IRSA story, no extra third-party trust boundary.
- ADR-017: Lambda+EKS hybrid search. Decision: Lambda for edge auth/cache/scope, Express on EKS for the index. Rationale: data gravity at the cluster, edge logic at Lambda; preserves RLS in a single trust boundary; demo signal of "right tool per workload".
- ADR-018: API GW WebSocket vs AppSync subscriptions. Decision: API GW WebSocket. Rationale: explicit connection registry shows event-driven design, simpler auth model, cheaper at low scale; AppSync rejected because adding GraphQL just for subs is out of proportion to the rest of the API surface.
- ADR-019: Step Functions Standard for checkout saga. Decision: SF Standard over inline Express transaction or SF Express. Rationale: visible execution graph (interview demo), durable history for audit, native compensation, low cost on burst traffic.
- ADR-020: Next.js standalone on EKS over Lambda@Edge / OpenNext. Decision: EKS standalone. Rationale: reuses every platform pattern (PSS, NetPol, IRSA, OTel, Gatekeeper), one ALB, no fight with Next.js conventions, matches the order-api operational model.
- `master-runbook.md` extensions:
  - "Storefront overview" linking to each component.
  - "Cognito user signup" runbook (creating test users, setting `custom:tenant_id`).
  - "Storefront secrets rotation" (HMAC, OTel token, Cognito client).
  - "WS troubleshooting" (stale connections, JWT expiry, fanout DLQ).
  - "Checkout saga compensation" (replaying failed executions, manual compensation).
- `demo-bringup.md`: pre-reqs (tfvars, AWS creds, domain delegation), step order (foundation → cluster → platform → app build → seed data → smoke test), 60-minute target from a clean account.
- `demo-teardown.md`: step order (stop active SF executions → drain Kinesis → empty S3 buckets → destroy platform → destroy cluster → optionally destroy foundation), cost gotchas (Kinesis on-demand idle hourly charge; CloudFront cache invalidation not free).
- `scripts/destroy.sh` extensions: drain Kinesis (no-op on on-demand but explicit `describe-stream` check), empty `cloudops-assets-<env>` bucket and `cloudops-cart-<env>` table before TF destroy, stop running SF executions (`aws stepfunctions list-executions --status-filter RUNNING` then `stop-execution`).

**Acceptance criteria:**
- All 5 ADRs follow the existing 1-page template (Status, Context, Decision, Consequences, Alternatives).
- README index updated with the new ADRs.
- `demo-bringup.md` is reproducible from a clean AWS account in under 60 minutes (verified by a dry run on a sandbox account).
- `destroy.sh` exits cleanly with `--mode=full` after a demo run; no orphaned resources.
- Master runbook table-of-contents updated with the new sections.

---

## Validation Commands

Before claiming a change is done, run the relevant subset:

**Terraform**
```bash
terraform fmt -check -recursive
terraform validate                  # works after `./scripts/tf-init.sh`
tflint --recursive --config="$(pwd)/.tflint.hcl" --minimum-failure-severity=error
./scripts/tf-init.sh                # never plain `terraform init`
actionlint                          # GitHub Actions workflow lint
```

**App (`apps/order-api/`)**
```bash
npm ci
npm test                            # node:test, no AWS needed
npm run lint                        # eslint flat config
npm run audit                       # npm audit --audit-level=high
npm run contract-check              # env-var drift between src/ and k8s/deployment.yaml
```

**Kubernetes manifests**
```bash
./scripts/validate-k8s-manifests.sh   # render + kubeconform; auto-installs to .tools/
```

**Self-healing rollback (after an apply)**
```bash
kubectl get rs -n cloudops -l app=order-api \
  -o custom-columns=NAME:.metadata.name,REVISION:.metadata.annotations.deployment\\.kubernetes\\.io/revision \
  --sort-by='.metadata.annotations.deployment\.kubernetes\.io/revision'
# Two revisions present = rollback path has something to revert to.
```

---

## 2026-04-23 — prod-enterprise reshape

Big reshape: prod-grade patterns landed across the stack as TF, gated by safe
defaults. Dev floor unchanged; prod tfvars unlock the full set.

### Observability
- **Bucket hardening** (Loki, Tempo, plus new Mimir/Thanos buckets): versioning,
  lifecycle expiration, KMS CMK encryption, force_destroy toggle, cross-region
  replication. All driven by `buckets_*` vars.
- **Per-domain KMS CMKs** (`modules/observability/kms.tf`): one CMK per signal
  type, 1-year automatic rotation, deletion window 7 days.
- **Loki HA**: `loki_replication_factor` / `loki_write_replicas` /
  `loki_read_replicas` as vars. Defaults stay 1/2/2 (dev). Prod: 3/3/3.
- **Prometheus HA**: `prometheus_replicas` (default 1) with podAntiAffinity by
  zone topology when >1. Optional remote_write to Mimir on
  `metrics_long_term_storage = "mimir"`.
- **Tempo HA**: `tempo_ingester_replicas` (default 1), `tempo_metrics_generator_enabled`
  for span-derived RED metrics.
- **Mimir** (default long-term metrics) — `modules/observability/mimir.tf` +
  IRSA + S3 bucket (same hardening flags) + Grafana datasource ConfigMap.
  Activated by `metrics_long_term_storage = "mimir"`.
- **Thanos** (alternative) — `modules/observability/thanos.tf` with bitnami
  helm chart, store-gateway + compactor + querier. Activated by
  `metrics_long_term_storage = "thanos"`.

### Data layer
- **RDS Secrets rotation** — `database_rotation_enabled` + `database_rotation_lambda_arn`
  + `database_rotation_days`. Caller deploys SAR's
  `SecretsManagerRDSPostgreSQLRotationSingleUser` and passes the Lambda ARN.
- **Secret recovery window** — `database_secret_recovery_window_days` (default 7,
  set 0 in test envs for instant deletion).
- **AWS Backup** — `modules/backup/` (vault + plan + selection). Daily/weekly/
  monthly schedules, KMS-encrypted, optional vault lock (`backup_vault_lock_enabled`).
  CRITICAL: vault lock makes the vault undeletable until `min_retention_days`
  expires. NEVER enable in test envs.

### Networking
- **VPC flow logs** now have `flow_logs_destination = "cloudwatch" | "s3"`. S3
  mode lands parquet + Athena partitioning in a per-account bucket. Lifecycle
  expiration matches `flow_logs_retention_days`.
- NAT-per-AZ already worked correctly (count = az_count when enable_nat_gateway).
  Prod-test sets az_count=3 to get 3-AZ NAT.

### Edge
- **WAFv2** — `modules/ingress/waf.tf` regional web ACL with managed rule
  groups (CRS, KnownBadInputs, SQLi, AnonymousIpList), per-IP rate limit (2000/5min
  default), optional geo-block list, CloudWatch logs subscription. Attaches to
  the LBC-managed ALB by tag lookup. Activated by `enable_waf = true`.

### Compliance
- **`modules/compliance/`** (new) bundles four toggleable services:
  - `enable_cloudtrail` — multi-region trail, log file validation,
    `cloudtrail_object_lock_enabled` + retention days for compliance mode.
  - `enable_guardduty` — detector + EKS audit logs + S3 protection +
    optional malware protection. EKS Runtime Monitoring as separate feature toggle.
  - `enable_config` — recorder + delivery channel + bucket;
    `config_conformance_packs` accepts S3 URIs for packs (CIS, NIST, PCI).
  - `enable_security_hub` — account enable + standards subscriptions. Defaults
    include CIS AWS Foundations + AWS Foundational Best Practices.

### Secrets
- **External Secrets Operator** — `modules/security/external_secrets.tf`. IRSA
  role with secretsmanager:GetSecretValue, helm release of
  external-secrets/external-secrets, default ClusterSecretStore preinstalled.
  Activated by `enable_external_secrets = true`.

### Tear-down
- **destroy.sh rewritten**. Default mode preserves Route 53 + OIDC + state
  bucket. `--nuke-bootstrap` flag wipes everything.
- New steps handle prod-grade complications:
  - Disables RDS deletion_protection before delete; waits for replica + primary.
  - Empties + deletes leftover Mimir/Thanos/flow-logs/CloudTrail/Config buckets
    that may persist past TF destroy when force_destroy=false.
  - AWS Backup vault check — warns and skips when `Locked = True`.
  - GuardDuty / Security Hub / Config recorder cleanup as separate API calls.

### Per-env tfvars
- New `environments/staging.tfvars.example` — full prod patterns ON, but
  destroy-blockers (deletion_protection, object_lock, vault_lock,
  skip_final_snapshot) flipped to safe values. The file documents each
  destroy-safety override inline so when copying to a true prod tfvars these
  comments make the differences obvious.

### Known follow-ups
- Real auth (Cognito / OIDC), per-tenant rate limiting, multi-tenant DB schema,
  service mesh (Cilium / Istio), separate state per env. All in
  `docs/prod-roadmap.md` as P1-P3 backlog items — too app-side for this batch.

---

## Historical Change Log (compact archive)

### 2026-04-21 — pipeline + LBC + cleanup batch
- **`8117811`** — DB subnet group import step in `infra.yml` (handles `DBSubnetGroupAlreadyExists` after overnight teardown leaves the group orphaned in AWS but absent from state).
- **`59cb863`** — removed module-disable `-var` overrides from the plan step (kubernetes provider was falling back to `localhost`).
- **`e148d84`** — LBC image now pulled via ECR pull-through cache (`modules/bootstrap/ecr_cache.tf` + node IAM `ecr_pull_through_cache` policy + Helm `image.repository` override). Same commit removed the invalid `aws_vpc_endpoint.acm` (no `com.amazonaws.<region>.acm` service exists).
- *Manual, no commit*: overnight teardown destroyed EKS / networking / ingress; kept bootstrap + dns. Destroys staged with `-target` and `enable_observability=false` to dodge PrometheusRule CRD validation errors during plan refresh.
- *Manual, no commit*: cluster auth switched from `CONFIG_MAP` to `API_AND_CONFIG_MAP` via AWS CLI for LBC debugging (account/IAM details masked here; see backlog item #1).

### 2026-04-22 — `7dcbfa2` platform hardening (batch 1)
- Self-healing rollback is now a real `rollout undo` (find previous ReplicaSet by revision annotation, PATCH deployment template). Namespace + app name env-driven.
- order-api split probes (`/health` liveness, `/ready` readiness) and moved `/metrics` to a separate server on port 9090.
- Optional `X-Api-Key` gate on `/order` + `/orders` (timingSafeEqual), sourced from `API_KEY_SECRET_ARN`.
- Real migrations (`apps/order-api/src/migrations.js` + `migrations/*.sql` + `schema_migrations` tracking table) replace `CREATE TABLE IF NOT EXISTS`.
- Depersonalized load-bearing strings: new required `var.domain_name`, `github_repo` defaults empty, cosign uses `${{ github.repository }}`, oidc.sh auto-detects repo from git remote.
- `terraform.tfvars` untracked; `.example` committed. `.pluralith/` and lambda zip artifacts ignored.
- Workflows: `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true`; `actions/checkout` and `actions/setup-node` bumped to `@v5`.

### 2026-04-23 — batch 2 hardening
- `.terraform.lock.hcl` tracked. `.gitattributes` (`text=auto eol=lf`) ends CRLF churn.
- App: `PodDisruptionBudget` (minAvailable=1), `NetworkPolicy` (default-deny + explicit allow for kube-system → :3000 and `monitoring` → :9090), `express-rate-limit` (60 req/min/IP) on data endpoints.
- CI: `npm audit`, `npm run lint` (ESLint 9 flat), `npm run contract-check` wired into the `test` job. Per-env tfvars scaffolding under `environments/`.
- Depersonalization sweep: `tamendutta.com` → `example.com`, `tamen25/CloudOps` → `your-org/your-repo` across docs/runbooks/dashboards/tf. `infra.yml` stale-lock derives bucket from tfvars at runtime. Gatekeeper namespaces use `var.application_namespace`.
- Cost: `eks_node_capacity_type` var (`ON_DEMAND` / `SPOT`), RDS `CPUCreditBalance` alarm conditional on burstable instance class.
- Alerting: Grafana unified alerting on (`unified_alerting.enabled=true`, legacy off). Sidecar watches `grafana_alert=1` and `grafana_datasource=1`. New `modules/observability/alerting.tf` provisions contact points + notification policies + Alertmanager datasource. Three new vars: `alert_email`, `alert_sns_topic_arn`, `grafana_alert_webhook_url`.

### 2026-04-27 — finishing batch (backlog #2, #10, #14)
- **#2 (wont-fix)** — Gatekeeper image-sig regex tied to `var.github_repo` at TF time. Functional today; no action.
- **#10 (resolved)** — `provider.tf` backend `key` is now partial. `scripts/tf-init.sh` derives `<environment>/terraform.tfstate` from `terraform.tfvars`. Override with `STATE_KEY=...`. Existing users migrate with `STATE_KEY=dev/terraform.tfstate scripts/tf-init.sh -migrate-state`.
- **#14 (resolved)** — `modules/observability/yace.tf` deploys yace + IRSA + PrometheusRule for RDS / ALB CW-sourced alerts. New root var `enable_yace`. Supersedes #13 (direct CW datasource path).

### 2026-04-27 — medium batch (backlog #6, #11, #12)
- **#6 (resolved)** — `scripts/tf-init.sh` adds `aws s3api head-bucket` preflight against `bootstrap_bucket_name`. Aborts on mismatch. `SKIP_BUCKET_CHECK=1` for first-time bootstrap.
- **#11 (resolved)** — `modules/database/rotation_lambda.tf` auto-deploys SAR `SecretsManagerRDSPostgreSQLRotationSingleUser` via `aws_serverlessapplicationrepository_cloudformation_stack`. New vars: `database_rotation_lambda_auto_deploy` (root), `rotation_lambda_subnet_ids` / `rotation_lambda_security_group_id` / `rotation_lambda_endpoint` (module). `secrets.tf` resolves the final ARN through `local.resolved_rotation_lambda_arn` (explicit > SAR-deployed).
- **#12 (resolved)** — `modules/ingress/waf.tf` `data.aws_lb.public` and `aws_wafv2_web_acl_association.alb` gain `depends_on = [helm_release.lb_controller]`. Two-pass apply marker (`alb_dns_name != ""`) documented inline.

### 2026-04-27 — quick-wins batch (backlog #1, #3, #4, #5)
- **Backlog #1 (resolved)** — `modules/eks/cluster.tf` declares `access_config { authentication_mode = "API_AND_CONFIG_MAP", bootstrap_cluster_creator_admin_permissions = true }`. Closes the drift opened during the LBC debug session in 2026-04-21.
- **Backlog #3 (resolved)** — new `modules/observability/grafana_native_alerts.tf` provisions three Grafana-native rules in a single ConfigMap labelled `grafana_alert=1`:
  1. `loki-error-log-spike` — error/exception/fatal log lines in `var.application_namespace` over 50 in 5m (Loki datasource).
  2. `http-5xx-rate-surge` — service-level 5xx ratio > 5% sustained 5m (Prometheus). Fires earlier than the SLO availability fast-burn.
  3. `http-request-volume-drop` — order-api rate dropped to ~0 while the same window 1h ago was healthy (Prometheus). Catches the "service went silent" case the SLO ratio misses.
  CloudWatch-sourced rules (RDS, ALB) deferred to new backlog item #13 because they need a Grafana CloudWatch datasource + IRSA.
- **Backlog #4 (resolved)** — `scripts/verify-alerting.sh` checks the Alertmanager pod, the SLO PrometheusRule CRDs, ConfigMaps with `grafana_alert=1`, and (optional, env-gated) the Grafana ruler API for the three new rule UIDs.
- **Backlog #5 (resolved)** — `infra.yml` compliance-scan step and `app.yml` budget-check + security-posture-check steps now derive `DOMAIN` from `secrets.TF_VARS` at the top of the step (`grep '^domain_name' | sed ...`), defaulting to `example.com`. Step-summary dashboard URLs now resolve to a real hostname.
- **New backlog item #13 (open, P3)** — Grafana CloudWatch datasource + IRSA. Spun out of #3. Unblocks proper RDS `CPUCreditBalance` and ALB 5xx alerts via Grafana unified alerting.

### 2026-04-23 — partial backend + alertmanager toggle
- `provider.tf` backend block no longer pins `bucket`. New `scripts/tf-init.sh` reads `bootstrap_bucket_name` from tfvars and passes `-backend-config`. All workflow `terraform init` calls switched to the helper (validate step kept on `-backend=false`).
- `var.enable_alertmanager` (root + observability module) toggles the kube-prometheus-stack Alertmanager pod. Default `true` in `terraform.tfvars`. Adds ~50m CPU / ~100Mi RAM when on.

**Code Review Findings (2026-05-14)**

Application (order-api):

Infrastructure (Terraform):

Kubernetes Manifests:

CI/CD Workflows:

Database Migrations:

Storefront (Next.js):

---

## 2026-06-07 — resolved-backlog archive (moved out of CLAUDE.md)

Resolved rows lifted from CLAUDE.md "Open Backlog" so the live guide holds only
`open`/`in-progress` work (#16, #9). These are the resolution notes as written
at close time. IDs #105–#130 also appear above in their original `open` form
(2026-05-14 snapshot); the rows below are the resolved state of those same IDs.

### Distributed mesh (2026-05-31)

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 143 | resolved | P3 | Real chaos engineering (pod-kill) for the loadgen | Resolved 2026-06-02: `POST /chaos/kill` on loadgen (HMAC-gated) + BFF `/api/load/chaos` (admin+Cognito). Four guards: namespace-scoped `delete pods` Role (`modules/loadgen/rbac.tf`, `enable_chaos` default false), fixed mesh allowlist (`apps/loadgen/src/chaos.ts` — loadgen/infra NOT killable), dry-run default, single-pod clamp. Injected `PodClient` (real one via `@kubernetes/client-node` in `k8s.ts`); 9 chaos + 6 app tests. Recovery is stock Deployment/ReplicaSet reschedule — trace map shows error edge then recovery. Runbook `docs/runbooks/security/chaos-pod-kill.md`. When off: no RBAC, `/chaos/kill` → 404. |
| 144 | resolved | P3 | `/traces` span-waterfall deep view | Resolved 2026-06-02: in-app waterfall replaces the Grafana-deferral placeholder. `apps/storefront/src/lib/trace-waterfall.ts` is a pure parser — folds Tempo OTLP (`batches`/`resourceSpans` aliases) into a parent→child tree, flattens depth-first with depth/offset/duration/error (OTLP status 2); orphans→roots, multi-root forests + sibling start-order handled (9 tests). `components/console/TraceWaterfall.tsx` fetches on select + renders bars positioned by offset, sized by duration; error spans use `var(--danger)` so a #143 pod-kill shows the failed hop. |
| 145 | resolved | P4 | Mesh services reuse the `libraries/<lang>` OTel ports for logs | Resolved 2026-06-02 via documented deferral — `docs/adr/027-mesh-direct-instrumentation-over-log-libraries.md`. Keep direct instrumentation. Key facts: no monorepo dep-linking exists (no workspaces / replace-directives / editable installs; `@cloudops/otel-logs` consumed by zero apps), so wiring needs registry+build-pipeline work for a P4; Node pino logs are ALREADY OTLP-bridged + trace-correlated via `instrumentation-pino` (bundled in auto-instrumentations, default on) so the Node port is redundant; traces (the mesh's primary signal) already flow. Triggers to revisit documented in the ADR. |
| 146 | resolved | P2 | Coordinated repo-wide OTel JS bump (GHSA-q7rr-3cgh-j5r3) | Resolved 2026-06-02: single coordinated bump across order-api + api-gateway + payment + loadgen — `sdk-node`/`exporter-*-otlp-http`/`sdk-logs` `0.52 → 0.218`, `auto-instrumentations-node` `0.49 → 0.76`, `sdk-metrics` `1.25 → 2.7`. Storefront **excluded** (carries no `@opentelemetry/*` deps; backlog note was stale). No source changes — `tracing.ts` API surface unchanged between generations. Per service: `npm audit` = 0 vulns, tsc clean, full suite green (order-api 123 / gateway 10 / payment 5 / loadgen 14), `tracing.ts` starts the SDK at runtime. Lockfiles regenerated from clean installs. |
| 147 | resolved | P4 | Wire coverage-gated step into mesh.yml node/python matrices | Resolved 2026-06-02: mesh.yml node job runs `npm run test:coverage` (per-service gates already in package.json); python job runs `pytest --cov --cov-fail-under=90`. projection-worker gained pytest-cov + `[tool.coverage.run]` (omit `poller.py`, the boto3 loop — mirrors inventory's `tracing.py` exclusion; 99% testable). api-gateway's never-enforced branch gate was at 79.55% — added 4 tests (header forwarding / non-JSON body / fraud fail-open) → 89.58%. Go(70)/Java(60) parity reached. actionlint clean. |

### Platform (long-running stories)

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 69 | resolved | P2 | Story: lift Java/.NET/C++ library coverage gates | Resolved 2026-05-14: Java line gate raised 0.40 → 0.50 in `libraries/java/logs/pom.xml` (actual coverage 57%, verified via `mvn verify` locally). .NET line gate raised 40 → 45 in `.github/workflows/libraries.yml` (mirrors Java shape; conservative bump with margin). C++ stays at 50 from prior session. |
| 76 | resolved | P2 | Story: self-hosted GitHub runner in VPC | Resolved 2026-05-14 (design portion): `docs/adr/025-self-hosted-runner-in-vpc.md` records the ARC-on-EKS decision, module layout (`modules/ci-runner/`), runner-image plan, workflow changes, IAM scoping, and acceptance criteria. EC2 + AWS-managed alternatives evaluated and rejected. Implementation is a separate story (#76-impl, see Open Fix Order); emergency CIDR (`eks-emergency-access.yml`, ADR 013) stays as ARC-recovery path. |
| 61 | resolved | P2 | Story: publish OTel ingestion config to SSM Parameter Store | Resolved 2026-05-14: `modules/observability/ssm_otel_config.tf` publishes `/cloudops/<env>/otel/endpoint(/metrics\|/traces\|/logs)` as String and `/cloudops/<env>/otel/api-key` as SecureString when `var.publish_otel_ssm_config = true`. Wired through `main.tf`, root + `stacks/platform` variables/outputs, ADR 003, and `docs/runbooks/master-runbook.md`. Token rotates with `random_password.otel_api_key.keepers`. |
| 62 | resolved | P3 | Story: reduce root-folder clutter without breaking repo entrypoints | Resolved 2026-05-14: verified target moves already shipped — `deploy.sh`/`destroy.sh`/`oidc.sh` live in `scripts/`, no `*.sh` at repo root, remaining root markdown/tfvars artefacts (`STOREFRONT_REDESIGN.md`, `terraform.dev-backup.tfvars`, `.pluralith*`) are gitignored. Root Terraform files stay in place pending #16 validation. |

### Security Review findings (2026-05-14)

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 95 | resolved | P2 | OTel bearer token rotation not automated | Resolved 2026-05-14: fixed the `keepers` formula in `modules/observability/secrets.tf` (the floor() was in the wrong place, causing daily rotation instead of windowed). Removed the stale `CKV2_AWS_57` skip comment. Added `otel_token_rotation_days = 90` to `environments/staging.tfvars.example` so the rotation path is exercised in staging. Force a rotation: `terraform apply -replace=module.observability.random_password.otel_api_key`. |
| 96 | resolved | P2 | HMAC secret rotation manual | Resolved 2026-05-14: dual-accept rotation in `apps/order-api/src/app.ts`. New env `INTERNAL_HMAC_SECRET_PREVIOUS` (mounted from `order-api-internal/hmac-secret-previous`) is accepted in constant time alongside the active key. Caller migration window: write new value to `hmac-secret`, prior to `hmac-secret-previous`, then clear `previous` once all callers have rolled. 3 new tests in `products.test.ts`. |
| 97 | resolved | P2 | No CSRF protection on state-changing endpoints | Resolved 2026-05-14: Origin-check middleware in `apps/order-api/src/app.ts` rejects POST/PUT/PATCH/DELETE with a browser Origin not in `ALLOWED_ORIGINS` (comma-separated env). RSC server-to-server fetches (no Origin) and safe methods bypass. `/_internal/*` skipped (HMAC-gated). Empty allow-list = permissive dev default. Wired into deployment.yaml + app.yml deploy stage. 5 new tests in `app.test.ts`. |
| 98 | resolved | P2 | Gatekeeper Cosign provider not deployed by default | Resolved 2026-05-14: `modules/security/gatekeeper.tf` now deploys `sigstore/cosign-gatekeeper-provider` helm chart when `enable_cosign_provider = true`. A `terraform_data.cosign_constraint_guard` precondition fails plan if the constraint is enabled without the provider (prevents accidentally bricking admission). Rollout runbook at `docs/runbooks/cosign-gatekeeper.md`. |
| 99 | resolved | P2 | Alertmanager not monitored | Resolved 2026-05-14: new `modules/observability/alertmanager_self_monitor.tf` ships a PrometheusRule with three alerts — `AlertmanagerDown`, `AlertmanagerConfigSyncFailing`, `AlertmanagerNotificationsFailing`. Gated on `var.enable_alertmanager`. `scripts/verify-alerting.sh` extended to assert the rule + its three alert names load. |
| 100 | resolved | P3 | JWT claim `tenant_id` vs `custom:tenant_id` ambiguity | Resolved 2026-05-14: documented precedence in code (`requireTenant` in `apps/order-api/src/app.ts`) and `docs/adr/021-tenant-claim-precedence.md`. Rules: (1) `custom:tenant_id` wins, (2) flat `tenant_id` fallback for non-Cognito IdPs, (3) `X-Tenant-Id` header only on the API-key path (never overrides a JWT), (4) literal `default` only in dev/test/local. JWT path NEVER falls through to the header — closes the tenant-pivot risk. |
| 101 | resolved | P3 | No security headers on API responses | Resolved 2026-05-14: added `helmet` to `apps/order-api/src/app.ts`. CSP off (JSON API, no HTML); HSTS 1y + includeSubDomains, X-Content-Type-Options nosniff, X-Frame-Options DENY (default SAMEORIGIN — verified in test), Referrer-Policy no-referrer, X-Powered-By removed, Cross-Origin-Resource-Policy same-origin. 1 new test in `app.test.ts`. |
| 102 | resolved | P3 | WAF logging retention only 30 days | Resolved 2026-05-14: new `var.waf_log_retention_days` in `modules/ingress`, root, and `stacks/platform` (default 30). `environments/staging.tfvars.example = 90`; `environments/prod.tfvars.example = 365`. Validation restricts to CloudWatch's documented retention values. |
| 103 | resolved | P3 | No DDoS protection (AWS Shield Standard only) | Resolved 2026-05-14 via deferral — see `docs/adr/022-shield-advanced-defer.md`. Compensating controls: WAF rate limit, managed rule groups, app-layer per-tenant rate limit (#45), OTel internal-only in prod. Triggers for revisit documented in ADR. |
| 104 | resolved | P3 | Missing SLO for auth endpoint availability | Resolved 2026-05-14: new `jwt_verify_total{outcome}` counter in order-api metrics, populated by `auth-jwt.ts` via an `onOutcome` callback. New `classifyJwtError()` maps jose errors to `ok/expired/wrong_issuer/wrong_audience/invalid_signature/missing_scope/jwks_unreachable/other`. New `modules/observability/jwks_alerts.tf` PrometheusRule fires `OIDCJWKSUnreachable` when the `jwks_unreachable` rate exceeds 0.1/s for 2m. 7 new tests in `auth-jwt.test.ts`. |

### Security Review findings (2026-05-15)

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 131 | resolved | P1 | Price tampering — client-supplied `price_cents` trusted end-to-end | Resolved 2026-05-15: two-layer fix. (1) Storefront `POST /api/cart` now accepts only `{productId, qty}`; server-side `getProduct(productId)` resolves authoritative `sku`/`name`/`price_cents` from order-api before `addToCart`. AddToCartButton client updated to send only productId. (2) Order-api `POST /order` re-prices inside the tenant tx via new `PRODUCT_PRICE_LOOKUP_SQL` (`SELECT sku, price_cents FROM products WHERE sku = ANY($1) AND is_active = true`); recomputes `total = Σ price_cents * qty / 100` and rejects mismatch with `422 invalid_total`, unknown/inactive SKUs with `422 unknown_sku`. 5 new tests in `test/order-repricing.test.ts`. Comment in `middleware.ts` documents why `/api/cart` remains public (guest cart path). |

### Security Review findings (2026-05-17)

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 132 | resolved | P3 | Storefront serves HTML with no security headers (mirror of #101) | Resolved 2026-05-17: `apps/storefront/next.config.ts` `headers()` returns CSP (enforcing — `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, `upgrade-insecure-requests`, `connect-src 'self' https: wss:` for the cross-origin API GW WS), HSTS 1y + includeSubDomains, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy no-referrer, Permissions-Policy disabling camera/mic/geo/payment, COOP + CORP same-origin. 5 new tests in `apps/storefront/test/security-headers.test.ts`. CSP keeps `'unsafe-inline'` on script/style until the nonce-middleware migration; documented inline. |
| 133 | resolved | P4 | No consolidated OWASP Top-10 status map | Resolved 2026-05-17: `docs/security/owasp-top-10-status.md` maps each 2021 category to resolved backlog IDs + open gaps. One row per category; "Open gaps" is source of truth. Bump "Last refreshed" on each update. |
| 134 | resolved | P3 | Open-redirect via `cloudops_post_login` cookie | Resolved 2026-05-17: new `isSafeNextPath()` helper in `apps/storefront/src/app/login/start/route.ts` rejects empty / non-string / `//x` / `/\\x` / absolute URLs. Applied at write time in `login/start` (the cookie can never persist a malicious value) AND at read time in `auth/callback/route.ts:48-54` (defence-in-depth for older cookies). Read-time also asserts `dest.origin === url.origin` before `NextResponse.redirect`. 5 new tests in `apps/storefront/test/redirect-safety.test.ts`. |
| 135 | resolved | P3 | Stored HTML injection in order-confirmation email Lambda | Resolved 2026-05-17: two-layer fix. (1) `modules/storefront-checkout/lambdas/email/index.mjs` exports `escapeHtml()` and wraps every interpolated field in `renderHtml()` (`it.sku`, `order.order_id`); `it.quantity` coerced via `Number()`. 4 new tests in `index.test.mjs`. (2) New `SKU_RE = /^[A-Za-z0-9._-]{1,64}$/` in `apps/order-api/src/app.ts`, enforced in `validateOrderPayload` AND `POST /_internal/admin/products`. 4 new tests in `test/sku-validation.test.ts`. |
| 142 | resolved | P4 | OAuth callback error message leaked through `?error=` query | Resolved 2026-05-17: `apps/storefront/src/app/auth/callback/route.ts` now collapses `exchangeCode()` failures to the literal `token_exchange_failed` reason instead of `err.message`. The full error is logged server-side via `console.error`. Exposed reasons are a closed whitelist (`KNOWN_ERROR_REASONS`); arbitrary strings can no longer land in browser history / referers. |
| 136 | resolved | P3 | `.gitignore` only ignored `.env*.local` — bare `.env` and `.env.production` would leak | Resolved 2026-05-17: tightened root `.gitignore` and `apps/storefront/.gitignore` to `.env` + `.env.*` with an allowlist for `.env.example` / `.env.*.example`. Verified no `.env*` files are currently tracked via `git ls-files`. |
| 137 | resolved | P3 | Pino loggers had no redact policy — Authorization / Cookie / HMAC sig could leak in error logs | Resolved 2026-05-17: new `apps/order-api/src/logger.ts` exports `createLogger()` with a redact policy covering `password`, `token`, `secret`, `authorization`, `cookie`, plus Express `req.headers.authorization` / `req.headers.cookie` / `req.headers["x-internal-signature"]` / `req.headers["x-api-key"]`. Replaced all 3 pino instantiations (`app.ts:103`, `server.ts:33`, `migrate.ts:19`) with the shared factory. 3 new tests in `test/logger.test.ts`. Storefront has no application logger (Next.js console only) so no change needed there. |
| 138 | resolved | P3 | Verify no JSON API response shape leaks PII / internal tokens | Resolved 2026-06-02: `docs/security/response-shape-audit.md` — one row per endpoint, response keys enumerated. order-api clean by design (`ORDER_SAFE_COLUMNS` excludes `owner_sub`; product SQL uses explicit column lists). storefront clean except F-138-1 (checkout returned the SFN `executionArn` — embeds account ID/region — plus raw SDK `err.message`); fixed same session in `apps/storefront/src/app/api/checkout/route.ts` (drop `executionArn`, collapse error to fixed reason + `console.error`, mirror of #142). order `id`/`tenant_id` echo assessed as informational, not leaks (client handle is the UUID `order_id`; RLS scopes reads). No P1–P3 leaks. |
| 139 | resolved | P2 | AWS Budget alerts but no hard-cap action | Resolved 2026-06-02: `modules/finops/budget_action.tf` adds an `aws_budgets_budget_action` (`APPLY_IAM_POLICY`, `AUTOMATIC`, ACTUAL) that attaches a deny policy (`ec2:RunInstances`, `eks:Create{Nodegroup,Cluster}`, `autoscaling:CreateAutoScalingGroup` — creation/launch verbs only; scale-down stays allowed for remediation) to configured roles when spend crosses `budget_hardcap_threshold_percent` (default 120%). Gated `enable_budget_hardcap_action` (default false) + requires `budget_hardcap_target_role_names` (empty = inert). Execution role trusts `budgets.amazonaws.com` (SourceAccount/SourceArn conditions) and may only attach/detach THIS policy to THOSE roles. Threaded through root + `stacks/platform` vars/main; staging example documents opt-in; runbook `abuse-response.md A3`. Static-verified (fmt/validate against real provider schema/tflint); the "fire in dev" acceptance step needs a live account. |
| 140 | resolved | P3 | No CSAM / NCMEC hash scan on storefront upload pipeline | Closed as moot 2026-06-02: the storefront asset-upload pipeline (`api/admin/upload/route.ts` + image-resize Lambda) was REMOVED 2026-05-31 when the storefront became the operator console — no user-facing upload surface remains. Verified: route file gone, only stale refs left (an unused `@aws-sdk/s3-request-presigner` dep + a path string in `redirect-safety.test.ts`). Building a Rekognition/NCMEC pipeline for a nonexistent surface would be wrong. Already recorded in `abuse-response.md` A1 + follow-ups. |
| 141 | resolved | P3 | Abuse-response runbook + Cognito advanced-security posture audit | Resolved 2026-05-17: new `docs/runbooks/security/abuse-response.md` covers four abuse scenarios (illegal upload, signup spam, API endpoint abuse, credential stuffing) with detection + containment steps and pointers to compromise runbooks. Verified `modules/auth/cognito.tf:59-61` already sets `user_pool_add_ons.advanced_security_mode = ENFORCED` in prod (AUDIT in lower envs) — bot/credential-stuffing protection is wired. `prevent_user_existence_errors = ENABLED` and `enable_token_revocation = true` also already in place. Two follow-ups filed: #139 (budget hard-cap action) and #140 (CSAM/NCMEC upload scan). |

### Code Review findings (2026-05-14)

**Application (order-api)**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 105 | resolved | P1 | A1: Test files use CommonJS while src is ESM | Resolved 2026-05-14: converted all 10 CJS test files in `apps/order-api/test/` to ESM (`import` syntax). Dropped `'use strict'` (ESM is strict by default). `products.test.ts` http import hoisted out of Promise executor. All 102 tests pass. |
| 106 | resolved | P2 | A2: Secrets Manager parse failure not logged | Resolved 2026-05-14: `resolveApiKey()` in `apps/order-api/src/server.ts` now `logger.warn`s the SM ARN + error message before falling back to plaintext. Catches both "rotated JSON → plaintext" and "rotated plaintext → JSON" misconfigurations. |
| 107 | resolved | P2 | A3: OTel SDK starts even when endpoint empty | Resolved 2026-05-14: `apps/order-api/src/tracing.ts` skips `NodeSDK` construction + `sdk.start()` when `OTEL_EXPORTER_OTLP_ENDPOINT` is empty. Prevents exporter retry storms against `undefined/v1/...` and SIGTERM-handler registration with no SDK to shut down. |
| 108 | resolved | P2 | A4: HMAC replay window not protected | Resolved 2026-05-14 via documented deferral — `docs/adr/024-hmac-replay-window.md`. 5min replay window accepted (server-to-server only, idempotent writes, audit trail + per-tenant rate limit). Inline comment at `apps/order-api/src/app.ts:464` points to the ADR. Triggers to add a nonce cache documented. |
| 109 | resolved | P3 | A5: Migration loop appears synchronous | Resolved 2026-05-14: comment at `apps/order-api/src/migrations.ts:86` explains why the loop must stay sequential — each `applyMigration` is its own transaction and the advisory lock holder needs a consistent `schema_migrations` row at every step. Explicit "do not Promise.all()". |

**Infrastructure (Terraform)**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 110 | resolved | P1 | I1: KMS encryption strategy inconsistent | Resolved 2026-05-14: kept per-signal observability CMKs (loki/tempo/mimir) and documented blast-radius / rotation rationale in `docs/adr/023-observability-kms-signal-separation.md`. EKS secrets CMK (#111) is a separate boundary. |
| 111 | resolved | P1 | I2: EKS secrets encryption skip unconditional | Resolved 2026-05-14: new `var.enable_secrets_encryption` in `modules/eks/variables.tf` (null = auto-enable for staging/prod). Dynamic `encryption_config` block + dedicated `aws_kms_key.eks_secrets` (rotation on) + cluster-role inline KMS policy in `modules/eks/secrets_kms.tf`. Removed unconditional `CKV_AWS_58` skip. Dev opts out; staging/prod get a CMK. |
| 112 | resolved | P2 | I3: SAR rotation Lambda has no update mechanism | Resolved 2026-05-15: documented bump procedure inline at the top of `modules/database/rotation_lambda.tf` (find latest version via `aws serverlessrepo get-application`, single-purpose PR bumping `rotation_sar_semantic_version`, apply dev → staging → prod, smoke-test rotation). Rejected `lifecycle.ignore_changes = [parameters]` — SAR template owns the Lambda IAM, silent drift would risk permission changes. |
| 113 | resolved | P2 | I4: WAF log retention only 30 days | Resolved 2026-05-15: 90d staging / 365d prod already shipped in #102 via `environments/{staging,prod}.tfvars.example`. Glacier archive deferred (CloudWatch Logs has no native Glacier tier; would require Firehose → S3 + lifecycle — module-sized change). Trigger for revisit documented in `modules/ingress/waf.tf` header. |
| 114 | resolved | P3 | I5: GitHub OIDC trust missing staging environment | Verified 2026-05-15: `modules/bootstrap/github_oidc.tf` trust policy already lists `repo:${github_repo}:environment:dev`, `:staging`, `:production` plus `refs/heads/main`. Backlog row was stale. |
| 115 | resolved | P3 | I6: No `terraform.lock.hcl` per stack | Verified 2026-05-15: `stacks/{foundation,cluster,platform}/.terraform.lock.hcl` all exist and are tracked in git. Backlog row was stale. |

**Kubernetes Manifests**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 116 | resolved | P2 | K1: Deployment replica count hardcoded | Resolved 2026-05-15: `apps/order-api/k8s/deployment.yaml:8` now uses `${ORDER_API_REPLICAS}` (render-k8s.ts already does generic placeholder substitution). Wired through `app.yml` validate + deploy env, `scripts/validate-k8s-manifests.sh`, and `scripts/deploy.sh`; default `2` everywhere, override via env. |
| 117 | resolved | P2 | K2: Migration Job has no deadline | Resolved 2026-05-15: `activeDeadlineSeconds: 600` added to `apps/order-api/k8s/migration-job.yaml`. A hung migration now fails the rollout instead of holding the advisory lock indefinitely (kubeconform validated). |
| 118 | resolved | P3 | K3: Storefront Ingress cert ARN placeholder | Resolved 2026-05-15: `apps/storefront/k8s/ingress.yaml` already uses `${ACM_CERT_ARN}`. Added a comment in the `if: false` deploy skeleton in `.github/workflows/storefront.yml` pointing to the `terraform -chdir=stacks/platform output -raw acm_certificate_arn` pattern for when the skeleton is activated by #84. |

**CI/CD Workflows**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 119 | resolved | P1 | C1: Manifest validation uses hardcoded IAM ARN | Resolved 2026-05-14: `app.yml:148-156` placeholders kept (kubeconform schema-only, never reaches cluster) but renamed to `PLACEHOLDER-not-real` and clarifying comment block points to terraform-output-driven deploy job. Real ARNs come from `terraform output` at deploy time. |
| 120 | resolved | P2 | C2: Terraform plan does not surface drift | Resolved 2026-05-15: `scripts/terraform-stacks.sh plan` now propagates `-detailed-exitcode` when `TF_PLAN_DETAILED_EXITCODE=1` — exit 2 across any stack = drift. `infra.yml` plan step sets the env var and converts exit 2 to a `::warning::` plus `drift=true` step output, leaving build green so reviewers can decide. |
| 121 | resolved | P3 | C3: Storefront workflow has placeholder jobs | Resolved 2026-05-15: added activation-criteria comment blocks above `build-and-push` (needs storefront ECR + IRSA, #84) and `deploy` (needs cluster prerequisites + cert ARN from terraform output, #118) in `.github/workflows/storefront.yml`. Skeletons stay `if: false` until prerequisites land. |
| 122 | resolved | P3 | C4: Drift detection schedule not configurable | Resolved 2026-05-15: `drift-detection.yml` now takes a `stacks` workflow_dispatch input (space-separated subset of `foundation cluster platform`). Operators can run mid-cycle drift on a single stack to raise effective cadence without editing the cron line. Scheduled fan-out unchanged. |
| 123 | resolved | P3 | C5: Libraries coverage has no aggregate report | Resolved 2026-05-15: new `coverage-aggregate` job in `.github/workflows/libraries.yml` downloads all 6 per-language `coverage-*-logs` artifacts, parses each summary, and writes a single markdown table (Language / Coverage / Gate / Source file) to the workflow step summary. Best-effort — missing artifact = `—` placeholder. |

**Database Migrations**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 124 | resolved | P3 | M1: SQL uses `--` comments | Resolved 2026-05-15: top-of-file and multi-line block comments in `apps/order-api/migrations/00{1..5}_*.sql` converted to `/* ... */`. Inline column-trailing comments left as `--` — `/* */` mid-line is more fragile than the SQL-standard line comment they replace. All 102 migration tests still pass. |
| 125 | resolved | P3 | M2: No rollback migrations | Resolved 2026-05-15: forward-only policy documented in `docs/runbooks/migration-rollback.md`. Covers three failure modes (txn-rollback / committed-but-broken schema / data corruption), pre-flight checklist for risky migrations, and explicit "no down.sql, no `schema_migrations` row deletion" guardrails. Existing guardrails (`#117` deadline + advisory lock + per-file txn + RDS snapshots) listed. |

**Storefront (Next.js)**

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 126 | resolved | P1 | S1: Guest cart UUID has no collision check | Resolved 2026-05-14: `ensureCartKey` in `apps/storefront/src/lib/cart.ts` writes a `GUEST#META` sentinel row with `ConditionExpression attribute_not_exists(pk)`. On `ConditionalCheckFailedException` it retries with a fresh UUID, up to 5 attempts, then throws `guest_id_collision_exhausted`. `getCart` already filters on `begins_with(sk, "ITEM#")` so the sentinel is invisible. |
| 127 | resolved | P1 | S2: JWT verification runs on static assets | Resolved 2026-05-14: backlog framing was stale — middleware already gated JWT on PROTECTED_PREFIXES (page routes only). Added `/__nextjs_`, `/robots.txt`, `/sitemap.xml` to `PUBLIC_PREFIXES` in `apps/storefront/src/middleware.ts` for defense-in-depth on Next.js dev overlay paths and common public assets. API routes do their own `verifySession` checks (intentional for guest cart support on `/api/cart`). |
| 128 | resolved | P2 | S3: Checkout cart hash race condition | Resolved 2026-05-15: new `acquireCheckoutLock` / `releaseCheckoutLock` in `apps/storefront/src/lib/cart.ts` write a `CHECKOUT#LOCK` DynamoDB row with `attribute_not_exists(locked_at) OR locked_at < :stale` (60s stale window). `apps/storefront/src/app/api/checkout/route.ts` acquires before reading items + StartExecution, releases in finally; concurrent checkout = 409 `checkout_in_progress`. Stale-lock fallback recovers from crashed handlers. |
| 129 | resolved | P3 | S4: WebSocket reconnect has no jitter | Resolved 2026-05-15: full-jitter helper `jittered(backoffMs) = Math.floor(Math.random() * backoffMs)` in `apps/storefront/src/lib/ws.ts`. Both reconnect paths (token-fetch failure + `onclose`) now use it. Prevents thundering-herd when a WS gateway restart drops many clients simultaneously. |
| 130 | resolved | P3 | S5: Presigned URL 60s too short for slow uploads | Resolved 2026-05-15: `apps/storefront/src/app/api/admin/upload/route.ts` raises `expiresIn` 60s → 300s. 10MB max payload over a ~50KB/s link fits within 300s. Multipart deferred — revisit if `MAX_BYTES` grows past ~25MB. |

### Storefront console-reframe regressions (2026-06-02)

Found dogfooding the storefront locally (`npm run dev`, port 3100). Root theme:
the storefront was reframed from a **shop** into an **operator console**, but
chrome (nav/footer/hero/bento) and the hand-built diagrams still reflect the old
shop + an older mesh topology. All verified against running dev server.

| ID | Status | P | Item | Notes |
|----|--------|---|------|-------|
| 148 | resolved | P1 | Dead shop links across site chrome after console reframe | Resolved 2026-06-02: removed every dead shop link. `Footer.tsx` "Browse" col (Catalog/Cart/Orders → `/products` 404 + `/cart`,`/orders` login dead-ends) replaced with a "Console" col (Service map/Services/Traces/Load); dropped the public-footer `/admin` link. `FeatureGrid.tsx` cards remapped (`/products`→`/architecture#search`, `/orders`→`/architecture#realtime`, `/checkout`→`/architecture#saga`, OTel→`/traces`, auth/RLS→`/platform`). `Bento.tsx` tiles remapped to `/architecture#…`/`/platform`. `Hero.tsx` + `CallToAction.tsx` "Start shopping"/`/products` → "Open the console"/`/console`. Verified: `curl` of every chrome href returns 200 (public) or 307 auth-redirect (console); `grep` confirms zero `/products|/cart|/orders|/checkout` links remain in `components/site`. |
| 149 | resolved | P2 | `/design` linked unconditionally but 404s in normal builds | Resolved 2026-06-02: new `src/lib/flags.ts` exports `designPreviewEnabled = process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "1"` (same flag the page gates on). `Navbar.tsx` + `Footer.tsx` only render the Design link when the flag is set; `Hero.tsx` + `CallToAction.tsx` CTAs fall back to `/architecture` ("See the architecture") when off. No visible `/design` link in a normal build. |
| 150 | resolved | P3 | Console pages give Cognito error with no local-dev story | Resolved 2026-06-02: rewrote the `/login` no-OIDC fallback (`app/login/page.tsx`) from the raw "Authentication unavailable" config error into a friendly state — names the requested `?next=` route, explains it's a Cognito-gated console surface and expected locally, lists the exact `OIDC_*` env to set + the `enable_auth=true` Terraform pointer (#80), and offers working escape links (Home/Architecture/Platform/Pipeline). Redirect path for configured envs unchanged. |
| 151 | resolved | P3 | Pipeline page animation did not run | Resolved 2026-06-02: root cause was NOT the animation — the #132 CSP (`next.config.ts`) had `script-src 'self' 'unsafe-inline'` with no `'unsafe-eval'`, which blocks the Next.js **dev** runtime (Fast Refresh + chunk eval) → **no client island hydrated in `next dev`** → `useInView` effect never ran → `inView` stuck false. Proven via Playwright: 0 IntersectionObservers created + a CSP `pageerror`. Fixed by adding `'unsafe-eval'` to `script-src` **dev-only** (`NODE_ENV !== 'production'`); prod CSP stays exactly as #132 hardened it. Post-fix probe: 2 IOs created, line `strokeDashoffset 0`, nodes teal, no pageerror. Added a regression test in `test/security-headers.test.ts` asserting prod script-src is eval-free (61 tests pass). NB: this also un-broke ALL dev client interactivity, not just the pipeline. |
| 152 | resolved | P2 | Architecture diagrams stale vs current mesh topology | Resolved 2026-06-02: rewrote both `/architecture` diagrams against the real mesh. `ArchitectureFlow.tsx` flows are now Mesh fan-out (api-gateway→pricing/Go→inventory/Py→fraud/Java→payment/Node→ledger/Go), Async events (order-api→Kinesis→enrichment λ→EventBridge→analytics λ), Projection read (Kinesis→projection-worker/Py→read model→console), Checkout saga; flow IDs double as anchors `#mesh/#realtime/#search/#saga` (the #148 chrome links resolve to them — verified in rendered HTML). `FullArchDiagram.tsx` EKS box now holds storefront+order-api+api-gateway + the 5-service mesh row, data layer gains `mesh-events` + `projection-worker`, `Prometheus`→`Mimir`, dropped stale `dynamo`/`s3` nodes, edges show mesh fan-out + both Kinesis consumers. Verified against `apps/` + `modules/mesh-events/lambdas/{enrichment,analytics}`. No console errors. |

