# ADR 020 — Next.js Standalone on EKS over Lambda@Edge / OpenNext

**Status:** Accepted
**Date:** 2026-05-13
**Authors:** CloudOps platform

---

## Context

The storefront is Next.js 15 App Router. Options for deployment:

1. **Standalone Node server in EKS** (Dockerfile multi-stage,
   `output: 'standalone'`, k8s Deployment behind the existing
   `cloudops` ALB group).
2. **Lambda@Edge / CloudFront Functions.** Pre-built static export
   for marketing routes, Lambda@Edge for dynamic. Requires
   restructuring the app into edge-runtime-compatible code.
3. **OpenNext on Lambda.** Adapter that runs full Next.js on Lambda
   behind CloudFront. Manages the build + deploy + cache lifecycle.

## Decision

**Standalone in EKS.**

Rationale:
- Reuses every platform pattern (PSS-restricted namespace, IRSA,
  NetworkPolicy, OTel via the existing collector, Gatekeeper,
  ServiceMonitor, Cosign image signature verification on rollout).
- One ALB serves both apps via the `cloudops` ingress group; no
  separate CloudFront distribution / Lambda execution role / API
  route to wire.
- No fight with Next.js features — middleware, RSC streaming,
  Server Actions, Route Handlers all run on the standalone server
  exactly as they do in `next dev`.
- Cold starts on Lambda@Edge / OpenNext are an extra failure mode
  on top of the cluster cold start we already have. Sticking with
  the standalone server keeps p99 latency in our control.
- The whole portfolio narrative is "we run prod-shaped Kubernetes" —
  shipping the storefront on Lambda would dilute that.

## Consequences

- The storefront pod is always-on (matched HPA), even when no users
  are browsing. Acceptable for the demo profile; not a multi-AZ
  prod-cost concern at the current scale.
- Lambda + EKS hybrids stay scoped to features that genuinely
  benefit (search-gateway #82, WS fanout #86, email #87, image
  resize #88).
- No global edge presence — single-region storefront. Acceptable
  given the target audience.

## Alternatives rejected

- **Lambda@Edge / CloudFront Functions:** needs RSC compromises +
  bifurcates the runtime story.
- **OpenNext on Lambda:** adds a build-and-deploy tool dependency,
  costs an additional cold-start path, and loses the
  reuses-every-platform-pattern argument.
