# ADR 016 — Cognito User Pool over Auth0/Clerk

**Status:** Accepted
**Date:** 2026-05-13
**Authors:** CloudOps platform

---

## Context

The storefront needs identity for sign-up, login, and tenant scoping
(`custom:tenant_id`). The order-api already verifies JWTs via `jose`
(`auth-jwt.ts` from backlog #7), so any IdP that exposes a standard OIDC
discovery document slots in with a one-line env swap.

Options:

1. **Cognito User Pool** — AWS-native, free up to 50k MAU, hosted UI,
   custom attributes (`custom:tenant_id`), groups for admin gates.
2. **Auth0 / Clerk** — better UX out of the box, faster signup polish,
   pricing scales with MAU and connections.
3. **Roll-your-own** — Postgres `users` table + sign-up endpoint +
   refresh-token store + email verification + password reset. Owns
   100% of the security surface.

## Decision

**Cognito.**

Rationale:
- One trust boundary across the whole platform (Cognito → JWT → every
  service verifies the same way).
- Custom attributes already drive tenant scoping in `requireTenant`
  (#80) without any code change in `auth-jwt.ts`.
- Hosted UI removes 100% of the password / verification / forgot flow.
- Cognito group `admin` is the single source of truth for the
  `/admin/*` storefront gate (#88).
- Cost is zero under the MAU we will plausibly hit in a portfolio demo.
- IRSA story is intact — no third-party identity sitting between AWS
  resources and our pods.

## Consequences

- Customers see a Cognito Hosted UI, not a fully custom signup screen.
  Acceptable for the demo; replace with a custom flow + Cognito SRP if
  brand presentation becomes a requirement.
- Cognito JWKS is a regional dependency — if `cognito-idp.<region>` is
  degraded, the storefront's `/api/ready` flips red.
- Some niceties (passwordless, magic links, multi-IdP federation) need
  manual configuration vs. Auth0's defaults.

## Alternatives rejected

- **Auth0 / Clerk:** adds a third-party trust boundary + ongoing cost.
- **Roll-your-own:** ownership cost on a demo project is unjustified.
