# ADR-021 — Tenant claim precedence (`custom:tenant_id` over `tenant_id`)

**Status:** Accepted (2026-05-14)
**Closes:** backlog #100

## Context

The order-api `requireTenant` middleware historically accepted two JWT
claims for tenant identity:

- `custom:tenant_id` — what Cognito issues. User Pool custom attributes are
  always namespaced with the `custom:` prefix; you cannot configure Cognito
  to emit a flat `tenant_id` claim.
- `tenant_id` — what generic OIDC providers (raw Keycloak, internal SSO
  with custom claim mapping) typically issue. There is no provider-side
  prefix.

The pre-#100 code accepted either, in arbitrary order, with no documented
precedence. A future refactor could plausibly:

- Drop one path believing it was unused.
- Reorder the checks and silently change behavior for tokens carrying both
  claims (e.g., a federation bridge that copies the Cognito attribute).
- Mix the claim with the `X-Tenant-Id` header so a JWT-authenticated caller
  could pivot tenant by setting a header (tenant cross-pollution).

## Decision

Tenant resolution has a single linear precedence:

1. **`custom:tenant_id`** (JWT claim, Cognito-shaped).
2. **`tenant_id`** (JWT claim, generic OIDC).
3. **`X-Tenant-Id`** request header — *only* when no JWT is present (API-key path).
4. **Literal `default`** — only in `nodeEnv ∈ {dev, test, local}`, no JWT, no header.

Rules 1 and 2 are mutually exclusive: if both are present, rule 1 wins and
rule 2 is ignored. We never merge claims.

Rule 3 is **never** reachable from the JWT path. A caller with a valid
token cannot override their tenant by attaching `X-Tenant-Id`. This is the
critical safety property.

## Rationale

**Why `custom:tenant_id` wins.** Cognito is our identity provider in
staging and prod (per ADR-016). Its custom attribute is the canonical
source. Generic-OIDC support is convenience for dev environments that
don't run Cognito; making it secondary keeps the prod path deterministic.

**Why not standardize on one claim.** Two reasons:

- Cognito *cannot* emit flat `tenant_id`. Forcing it would mean a custom
  claim-mapping Lambda on every token request — operational tax for no
  win.
- A future non-Cognito IdP (e.g., an enterprise SAML→OIDC bridge for a
  customer in a regulated industry) can't always be coerced into emitting
  `custom:`-prefixed claims.

Accepting both, with clear precedence, gives us both deployments for free.

**Why no header fallback on the JWT path.** Headers are forgeable by any
client that holds the token. Allowing `X-Tenant-Id` to override a JWT claim
turns "I have a valid token for tenant A" into "I can read tenant B's
data." This is the same class of bug as #51 (RLS) was designed to defend
against; we close the upstream path too.

## Consequences

- Existing tests (`multitenancy.test.ts`, `auth-jwt.test.ts`) keep passing
  unchanged — both claim styles were already exercised.
- Future Cognito tenant migrations: change Cognito's attribute schema;
  order-api needs no edit.
- Future non-Cognito IdP onboarding: configure the IdP to emit either
  `custom:tenant_id` or `tenant_id`. Document which in the IdP-specific
  runbook.
- A federation token carrying both claims will resolve to
  `custom:tenant_id`. If those values disagree, the federation bridge is
  buggy — log and audit, do not silently merge.

## Alternatives considered

- **Standardize on `custom:tenant_id` everywhere.** Rejected — requires
  Cognito-style namespacing for every IdP we ever integrate with. Cognito
  itself enforces the prefix and would not benefit; non-Cognito providers
  would have to fight their own schema rules.
- **Standardize on `tenant_id` everywhere.** Rejected — requires a token
  claim-mapping Lambda on every Cognito User Pool token request.
- **Header-only.** Rejected — explicitly insecure for authenticated paths.
