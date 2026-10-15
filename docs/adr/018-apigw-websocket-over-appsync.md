# ADR 018 — API Gateway WebSocket over AppSync Subscriptions

**Status:** Accepted
**Date:** 2026-05-13
**Authors:** CloudOps platform

---

## Context

Realtime order status updates need a tenant-scoped pub/sub between the
order-api's Kinesis event stream and the storefront browser. Choices:

1. **API GW WebSocket API + 3 Lambdas + Dynamo connection registry.**
   Connect Lambda verifies the Cognito JWT, writes `{connId, tenantId}`
   to Dynamo. Fanout Lambda consumes Kinesis, queries Dynamo by tenant,
   posts via `apigatewaymanagementapi:PostToConnection`.
2. **AppSync subscriptions.** GraphQL endpoint with native subscription
   support; Cognito as auth provider; subscriptions filtered server-side.
3. **Server-Sent Events from the Next.js pod.** Single direction, no
   protocol upgrade, works behind ALB. Loses on multi-replica fanout.

## Decision

**API Gateway WebSocket + 3 Lambdas + Dynamo registry.**

Rationale:
- The connection registry is explicit infrastructure — show in a
  trace + Grafana that fan-out is happening, who's connected, and how
  stale connections are pruned.
- AppSync would force a GraphQL surface for one feature; the rest of
  the API is REST + RSC. Mixing two API styles for a single demo flow
  is not a win.
- AppSync subscriptions are billed per message + per subscription
  minute. API GW WebSocket is billed per minute of connection +
  per-message; cheaper at low concurrency.
- The pattern (events stream → fanout Lambda → connection registry →
  push to client) is a textbook event-driven design that lands well
  in an interview demo.

## Consequences

- Hand-rolling reconnection + state recovery in the storefront client
  (the `useOrderUpdates` hook with exponential backoff).
- Operating an extra Dynamo table + 3 Lambdas.
- No GraphQL — clients use REST + the WS frame.

## Alternatives rejected

- **AppSync:** GraphQL surface for one feature isn't justified.
- **SSE-only:** loses on multi-replica fanout — every Next.js pod
  would need to know about every order, which is exactly what the
  Kinesis-driven fanout model avoids.
