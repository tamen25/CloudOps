# ADR-022 — Defer AWS Shield Advanced

**Status:** Accepted (2026-05-14)
**Closes:** backlog #103

## Context

AWS Shield has two tiers:

- **Standard** — free, auto-enabled. Covers infrastructure-layer (L3/L4)
  volumetric attacks against any AWS-resident resource. Mitigates SYN
  floods, UDP reflections, etc. No customer action needed.
- **Advanced** — $3,000 / month per account, plus data transfer surcharges
  during mitigated attacks. Adds:
  - L7 (application-layer) HTTP flood detection and mitigation.
  - Cost-protection: AWS refunds scaling charges incurred during a
    mitigated attack.
  - 24×7 access to the Shield Response Team (SRT).
  - Real-time attack visibility via CloudWatch metrics + global threat
    dashboard.
  - Health-based detection that correlates attack patterns with EC2 /
    ELB / Route 53 health checks.
  - Application-layer rate-limit refinement beyond what AWS WAF offers
    standalone.

CloudOps currently runs:

- Single AWS account.
- One public-facing ALB (cloudops) and one ALB for OTel ingestion when not
  internal-only.
- A regional WAFv2 web ACL on the public ALB with the AWS managed
  CommonRuleSet + KnownBadInputs + SQLi + AnonymousIpList + an IP-based
  rate limit of 2000 / 5 min (default; configurable via
  `waf_rate_limit_per_5min`).
- A separate WAFv2 web ACL on the OTel ALB (#38) with an allow-list or
  rate limit and `otel_ingestion_internal = true` recommended for prod.

## Decision

Defer Shield Advanced. Do not enable in dev, staging, or prod by default.

## Rationale

**Cost.** $3,000 / month × 12 = $36,000 / year minimum, before transfer
charges during an attack. Current product mode is a single-account dev
platform — that's a 10x+ multiplier on the entire monthly infra spend for
a feature with no exercised threat.

**Coverage we already have.** Standard tier mitigates the L3/L4 volumetric
attack classes that exhaust bandwidth or saturate ALB connection state.
That is the vast majority of "DDoS" attacks against an internet-facing ALB
in practice. The remaining L7 attack surface (slow loris, HTTP flood, low
& slow keepalive abuse) is partly addressed by:

- WAF managed rule groups (AWSManagedRulesCommonRuleSet inspects request
  shape and rejects obvious flood patterns).
- WAF rate-based rule (`waf_rate_limit_per_5min`, default 2000 req per IP
  per 5 min on the public ALB).
- ALB connection idle timeout + drain timeout.
- Express-rate-limit at the application layer keyed by tenant (#45).

A determined L7 attacker can still exhaust the WAF rate-limit by rotating
source IPs (botnet). Shield Advanced's "application-layer mitigation"
helps here, but so do upstream CDN-based protections (CloudFront +
Shield, Cloudflare, Fastly) at a fraction of the cost. None of those are
deployed today.

**Risk profile.** No paying customers, no SOC 2 / PCI scope, no customer
SLA. A successful L7 DDoS today means a hobby site is unreachable for an
hour — not a contractual breach, not data exposure, not a service-level
miss.

## Triggers for revisiting

Any one of:

1. **Customer onboarding.** A signed customer with availability SLAs in
   their contract. Shield Advanced (or a CDN+WAF equivalent) becomes
   table-stakes for the L7 mitigation guarantee.
2. **Public attack history.** Two or more credible attacks against
   `*.cloudops.example.com` in a rolling 90-day window.
3. **Regulatory.** Any compliance regime (PCI L1, FedRAMP, HIPAA with
   active health-care data) that names Shield Advanced or equivalent L7
   mitigation as a control.
4. **Cost-protection ROI flip.** When mitigated-attack scaling charges
   exceed $3k/mo on Shield Standard alone, Advanced pays for itself via
   the refund clause.
5. **Multi-account.** Shield Advanced is account-scoped; in a
   multi-account org the per-account cost amortizes across many ALBs
   under one Organization-wide subscription, changing the math.

## Compensating controls (today)

- WAF rate limit on public ALB (`waf_rate_limit_per_5min`).
- WAF managed rules drop known-bad shapes.
- App-layer rate limit on `/order` and `/orders` (per-tenant, #45).
- OTel ingestion internal-only in prod (`otel_ingestion_internal = true`).
- CloudWatch alarms on ALB `HTTPCode_ELB_5XX_Count` and
  `RequestCount` (via the kube-prometheus-stack ALB exporter).
- ALB access logs to S3 (already enabled), 90d retention (closes #102),
  for post-incident analysis.

## Documenting the gap

This ADR is the record, so future readers understand WAF rate-limiting + Standard tier is the primary DDoS defense
and is intentional, not a missing control.

## Alternatives considered

- **CloudFront in front of the ALB.** Adds an edge layer with Shield
  Standard auto-protection at a higher tier (Standard at the edge is more
  capable than Standard at a regional ALB), plus AWS-managed L7 rules
  free with CloudFront. Cost ~$0.085/GB transfer. Deferred but not
  rejected — the right move when a real CDN need (cacheable static
  content, global users) emerges. Storefront assets already use
  CloudFront (#88); extending the same distribution to API origin is a
  small step.
- **Cloudflare proxy.** Cheaper than Shield Advanced for L7 mitigation
  ($20–200/mo depending on plan), but adds a non-AWS dependency and
  splits the trust boundary. Rejected for the same reason ADR-016
  rejected Auth0 — AWS-native stack stays single-vendor.
- **Just-in-time enable.** Shield Advanced has a 30-day minimum
  commitment, so emergency enablement during an attack is too slow to
  matter for short-duration attacks. Not useful as a runtime knob.
