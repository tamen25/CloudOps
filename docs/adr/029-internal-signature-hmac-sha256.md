# ADR 029 — The internal request signature is HMAC-SHA256

**Status:** Accepted
**Date:** 2026-10-20
**Closes:** BACKLOG S09
**Amends:** ADR 024 (the replay window is unchanged)

## Context

Internal requests (search-gateway → order-api, payment → ledger, the
storefront → loadgen) carry `x-cloudops-hmac`, `x-cloudops-timestamp` and
`x-cloudops-tenant`. ADR 024 calls the signature "HMAC-SHA256", but every
service computed `sha256(timestamp.tenant.body.secret)`: a hash with the
secret appended, not an HMAC. A secret-suffix hash is a known-weak MAC
construction. The risk here was low (the secret is the suffix, tenants are
`[a-zA-Z0-9_-]`, the services are in-cluster), but it was not what the
docs said, and HMAC costs nothing extra.

## Decision

Every signer and verifier computes
`hex(HMAC-SHA256(secret, "<timestamp>.<tenant>.<raw body>"))`. The headers,
the 5-minute skew window (ADR 024) and the active/previous secret rotation
are unchanged.

All six services change in one commit, with no window in which both forms
are accepted: no environment is running, so there is no mixed-version
rollout to bridge. Every service's tests check the same fixed vector,
computed independently, so the Go and TypeScript sides cannot drift apart.

## Consequences

- A request signed the old way is refused (401).
- Deploy all six services from the same commit. Once an environment is
  running, a later change to the scheme needs a dual-accept window like the
  secret rotation's.
