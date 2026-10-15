# Abuse Response Runbook

Triggered when the platform is being misused — not when it's compromised.
For compromise scenarios use `compliance-critical-finding.md`.

## Scope

This runbook covers:
- **A1** — illegal / unwanted content uploaded via admin asset upload
  *(removed 2026-05-31 — the asset-upload pipeline no longer exists; kept for
  historical reference)*
- **A2** — bulk account creation (signup spam)
- **A3** — API endpoint abuse (script burns through compute / budget)
- **A4** — credential-stuffing / brute-force against Cognito hosted UI

It does NOT cover account takeover or data exfiltration — those are
compromise scenarios, not abuse.

## A1 — illegal content uploaded (REMOVED)

The admin asset-upload pipeline (storefront `/admin/upload` → CloudFront → S3
`${project}-storefront-assets-${env}` → image-resize Lambda) was removed on
2026-05-31 when the storefront was reframed as the operator console. There is
no longer a user-facing upload surface on the platform, so this abuse vector no
longer applies. The historical containment steps (disable admin account, delete
S3 variants + versions, CloudFront invalidation, NCMEC evidence preservation)
are preserved in `docs/backlog-archive.md` (#88) should an upload pipeline be
reintroduced. Backlog #140 (CSAM/NCMEC hash scan) is closed as moot.

## A2 — bulk signup / account-creation spam

**Detection.** Spike on `cognito_idp_sign_up` CloudTrail event count, or
`AccountCreationDailyCount` exceeding the env's `cost_budget_monthly_usd`
implied per-day baseline.

**Containment.**

1. Cognito advanced security is `ENFORCED` in prod, `AUDIT` in lower envs.
   In ENFORCED mode, Cognito's risk-based scoring already blocks high-risk
   signups. Check the user pool risk events:
   ```
   aws cognito-idp admin-list-user-auth-events \
     --user-pool-id <pool> --username <sub> --max-results 20
   ```
2. If signup attempts originate from a CIDR, add the CIDR to the WAF block
   list (`modules/ingress/waf.tf` has a managed IP set).
3. If signups are succeeding past advanced security, raise the risk
   configuration to require MFA on every sign-in (Cognito console → User
   pool → Advanced security → Risk configuration). Revert after the wave.
4. Mass-disable suspect accounts via a scripted `admin-disable-user` loop
   (filter by `created_at < 24h` AND `email_verified = false`).

## A3 — API endpoint abuse (script burning compute / budget)

**Detection.** `aws_budgets_budget` 80% / 100% notifications fire on
`cost-alerts` SNS topic. Order-api per-tenant rate limit (#45) returns 429s
above the configured `rateLimitMax`.

**Containment.**

1. Identify the abusive caller. For JWT-authenticated callers the tenant
   ID is in `audit_events.actor_id`; for API-key callers the source IP is
   in WAF logs (90d/365d retention per #102/#113).
2. Lower `rateLimitMax` for the affected env via app redeploy with a
   smaller env var, OR add a WAF rule scoped to the caller's IP / tenant.
3. If the source is a single tenant: revoke their API key in Secrets
   Manager (`aws secretsmanager update-secret-version-stage` to retire
   the active version) so order-api stops accepting it on next read.
4. The budget hard-cap action (`Backlog #139`) is wired in
   `modules/finops/budget_action.tf`, OFF by default. When enabled
   (`enable_budget_hardcap_action = true` + `budget_hardcap_target_role_names`),
   ACTUAL spend crossing `budget_hardcap_threshold_percent` (default 120%)
   auto-attaches a deny policy (`ec2:RunInstances`, `eks:CreateNodegroup`,
   `eks:CreateCluster`, `autoscaling:CreateAutoScalingGroup` — creation/launch
   verbs only; scale-DOWN is intentionally still allowed so you can shrink a
   runaway ASG during containment) to the target roles — so new compute/cluster
   growth fails immediately and steps 2-3 are moot. **Lifting the cap after a
   fire:** raise `cost_budget_monthly_usd` or `budget_hardcap_threshold_percent`
   and re-apply, OR detach `<project>-<env>-budget-hardcap-deny` from the
   affected roles out-of-band (`aws iam detach-role-policy`). Root-cause before
   re-enabling. The platform already running keeps running — the deny only
   blocks NEW spend.

## A4 — credential stuffing / brute-force against Cognito

**Detection.** Cognito advanced security raises `RISK_LEVEL = HIGH`
events; CloudTrail `InitiateAuth` failures spike.

**Containment.**

1. Cognito's account takeover protection is wired (`user_pool_add_ons`
   block in `modules/auth/cognito.tf`). In ENFORCED mode it auto-blocks.
2. Force-rotate sessions for the affected accounts:
   ```
   aws cognito-idp admin-user-global-sign-out \
     --user-pool-id <pool> --username <sub>
   ```
3. Require password reset for the affected accounts; reach out via
   verified email.

## Escalation

- Customer trust / legal exposure → `compliance-critical-finding.md`.
- Service unavailable (not just abusive) → `slo-fast-burn.md`.

## Open follow-ups

- ~~`Backlog #139` — wire AWS Budgets action for hard-cap enforcement.~~
  Resolved 2026-06-02: `modules/finops/budget_action.tf` (see A3 step 4).
- ~~`Backlog #140` — CSAM / NCMEC hash scan on storefront upload pipeline.~~
  Closed as moot 2026-06-02: the storefront upload pipeline was removed
  2026-05-31 (see A1). No user-facing upload surface remains.
