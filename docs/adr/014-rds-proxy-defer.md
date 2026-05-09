<!-- This document explains 014 RDS proxy defer for CloudOps. -->
# ADR 014 — Defer RDS Proxy Adoption

**Status:** Deferred
**Date:** 2026-05-09
**Authors:** CloudOps platform

---

## Context

order-api today connects directly to RDS PostgreSQL via `pg.Pool`. Each
pod opens its own pool of TCP connections to the primary. At current
scale (single-replica deployment, 24h-retention dev cluster) this is
fine. At higher scale or with Lambda consumers added later, three
problems become real:

1. **Connection saturation.** RDS has a hard `max_connections` limit. A
   pod scale-out (HPA, cron jobs, the migration Job) multiplies open
   connection count. Postgres rejects new connections at the limit.
2. **Failover gaps.** When RDS fails over to a standby, every direct
   client experiences a connection drop and has to reconnect. RDS Proxy
   pools and reconnects on the application's behalf; failover-induced
   error rates drop.
3. **IAM auth as a deploy story.** With RDS Proxy you can require IAM
   auth at the proxy and let the database itself stay password-only,
   moving credential rotation off the app pod and onto IAM session
   tokens. Without the proxy, IAM auth requires every client to be IAM
   aware (the AWS-RDS IAM token plug-in path).

Backlog #75 asked whether to adopt RDS Proxy now.

The cost side of the ledger:

- **Dollars.** RDS Proxy bills per vCPU of the proxy fleet, ~$0.015/vCPU/hr
  at current pricing. A 2-vCPU proxy is roughly $22/month per environment
  on top of RDS itself.
- **Operational surface.** Proxy adds a Secrets Manager → IAM →
  pg-protocol-aware fleet between the app and the database. Failures
  there look like `connection refused` or `auth failed` to the app, and
  the corresponding logs live in CloudWatch on a separate component.
- **Code.** Switching to IAM auth at the proxy means changing how the app
  obtains a connection token. Today the path is the existing Secrets
  Manager rotation; the proxy path is `aws_rds_iam_token` minted per
  connection. Two paths to maintain unless we cut the existing one,
  which is risky on its own.

Today's pain is not yet measurable. order-api runs at 1–3 pods with
plenty of headroom on RDS `DatabaseConnections`, the connection storms
the documentation warns about have not happened, and failover testing
is not yet routine (it lands with backlog #44/DR-related items).

## Decision

Do not adopt RDS Proxy right now. Document the trigger conditions and
revisit when at least one of them is true:

1. **Replica count.** order-api scales steady-state to ≥10 replicas, or
   another consumer (Lambda, batch worker) opens a comparable connection
   pool against the same primary.
2. **Connection saturation alert.** A `DatabaseConnections > 80%
   max_connections` alarm fires more than twice per quarter.
3. **Failover incident.** A managed failover or AZ event triggers a
   sustained error spike (>5 minutes of elevated 5xx) attributable to
   reconnect storms.
4. **Compliance requirement.** A customer or auditor requires database
   IAM auth and the existing Secrets Manager rotation path is no longer
   acceptable.

Until then, the cost (dollars + ops surface) is real and the gain is
hypothetical.

## Consequences

**Positive:**
- No new module or IAM path to maintain today.
- Avoids the trap of adopting infra "in case we need it" and then
  carrying it for years.
- The decision and triggers are explicit, so the next operator does not
  have to reconstruct the rationale.

**Negative:**
- A first connection storm or a real failover incident will take longer
  to resolve than it would with the proxy already in place.
- IAM-auth-at-proxy is not available as a fast option if a customer
  requires it on short notice.

**Revisit when:** any trigger above fires, or backlog #75 status changes
to `in-progress`. At that point this ADR is superseded by the
implementation ADR.
