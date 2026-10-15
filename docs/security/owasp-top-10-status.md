# OWASP Top 10 (2021) — Status Map

Consolidates the 2026-05-14 and 2026-05-15 security review findings against the
OWASP Top 10 (2021) categories. Each row points at the resolved backlog ID(s)
in [`../../BACKLOG.md`](../../BACKLOG.md) and `docs/backlog-archive.md`, plus any open gap.

Last refreshed: 2026-05-17.



| OWASP | Category | Status | Resolved IDs | Open gaps |
|-------|----------|--------|--------------|-----------|
| A01 | Broken Access Control | covered | #97 CSRF Origin check; #100 + ADR-021 tenant-claim precedence; #126 guest-cart UUID collision; #127 middleware prefix gating; #131 server-side price/SKU re-lookup; #134 open-redirect closed at both write + read time | Cart `[itemId]` PATCH/DELETE authorisation relies on the session cookie binding the `pk` — no IDOR path identified, but worth a dedicated test sweep. |
| A02 | Cryptographic Failures | covered | #95 OTel token windowed rotation (keepers fix); #96 HMAC dual-accept rotation; #111 EKS secrets CMK; #102/#113 WAF log retention 90d / 365d; #136 tightened `.gitignore` so bare `.env` cannot leak | None. |
| A03 | Injection | covered | order-api uses parameterised `pg` queries throughout; RLS in `003_rls.sql`; #131 price/SKU re-lookup uses `$1` array binding; helmet `X-Powered-By` removed (#101); #135 SKU character-set tightened to `^[A-Za-z0-9._-]{1,64}$` + email Lambda HTML-escapes every interpolated field | None. |
| A04 | Insecure Design | covered | ADR-021 tenant precedence; ADR-022 Shield Advanced deferral + compensating controls; ADR-024 HMAC replay window; #98 cosign-gatekeeper precondition guard | None. |
| A05 | Security Misconfiguration | covered | #101 helmet on order-api; **storefront `next.config.ts` headers (2026-05-17 — this PR)**; #99 Alertmanager self-monitor; #112 SAR rotation Lambda bump procedure documented | None. |
| A06 | Vulnerable & Outdated Components | partial | npm audit gate at `npm run audit` (high+); Java/.NET/C++ coverage gates lifted in #69; cosign-gatekeeper provider for signed-image admission (#98) | No automated Renovate / Dependabot bump cadence yet. |
| A07 | Identification & Authentication Failures | covered | #104 `jwt_verify_total{outcome}` SLO counter + JWKS-unreachable alert; #100 tenant precedence; ADR-016 Cognito over Auth0; ADR-021 forbidden header-override on JWT path; #141 Cognito `advanced_security_mode = ENFORCED` in prod + abuse-response runbook; #134 + #142 redirect/error hardening on OAuth callback | None. |
| A08 | Software & Data Integrity Failures | covered | #98 Gatekeeper image-signature constraint + cosign provider; #117 migration Job `activeDeadlineSeconds` (no half-applied schemas under advisory lock); ADR-019 Step Functions checkout saga (idempotent re-drive) | None. |
| A09 | Security Logging & Monitoring Failures | covered | #99 Alertmanager self-monitor; #104 OIDC JWKS-unreachable alert; #120 Terraform plan drift surfaces as CI warning; audit_events table (`005_audit_events.sql`); #137 pino redact policy on order-api blocks Authorization / Cookie / HMAC sig from logs | #138 verify no PII / internal token leaks in API response shapes. |
| A10 | Server-Side Request Forgery (SSRF) | covered | No user-controlled host or protocol reaches outbound HTTP; OTel collector + Cognito JWKS URLs come from env (trusted); storefront `api/admin/upload` uses `PutObject` not `PutObjectFromUrl` | None. |

## Abuse-prevention follow-ups (2026-05-17)

Not strictly OWASP, but tracked here for visibility — see
[`abuse-response.md`](../runbooks/security/abuse-response.md):

- **#139** — AWS Budgets has notifications but no `aws_budgets_budget_action`
  hard-cap. A runaway script can spend past 100% until a human reads the
  email. P2.
- **#140** — No CSAM/NCMEC scan on storefront uploads. Acceptable for
  dev/test; required before external admins. P3.

## How this map is maintained

- One row per OWASP 2021 category; do not split rows by sub-finding.
- "Resolved IDs" refer to backlog rows (`BACKLOG.md`, older ones in `docs/backlog-archive.md`). When a row is
  archived to `docs/backlog-archive.md`, leave the ID — readers grep both.
- "Open gaps" is the source of truth for what still needs work in that
  category. Empty cell = no known gap.
- Bump "Last refreshed" when adding a finding; rotate resolved findings
  into the appropriate row's "Resolved IDs" column.
