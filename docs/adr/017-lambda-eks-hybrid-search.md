# ADR 017 — Lambda + EKS Hybrid Search

**Status:** Accepted
**Date:** 2026-05-13
**Authors:** CloudOps platform

---

## Context

Storefront search needs Cognito-authenticated, tenant-scoped, ranked
product results with sub-100 ms warm latency. Three architectures
considered:

1. **Lambda-only:** API GW → Lambda → OpenSearch / DynamoDB. Lambda
   owns auth + scope + index. Cold starts hurt p99; OpenSearch
   Serverless minimum ≈ $170/mo idle.
2. **EKS-only:** ALB → Express in the cluster. Postgres FTS in RDS.
   Public endpoint on the cluster ALB; rate-limit lives in the app.
3. **Lambda + EKS hybrid:** API GW → Lambda (Cognito JWT verify, LRU
   cache, HMAC sign) → Express in the cluster (FTS query inside the
   RLS boundary).

## Decision

**Hybrid.**

Edge logic — JWT verification, in-memory LRU cache, HMAC signing — lives
in Lambda so the response path is short, cheap, and scales horizontally
with no fleet to manage. The index lives in EKS so it runs inside the
same RLS-enforced trust boundary as every other tenant-scoped read.
Postgres FTS via the generated `tsvector` column + GIN index hits the
sub-100 ms warm budget easily for the demo data set and removes the
OpenSearch Serverless idle cost.

## Consequences

- Two compute systems touch one read path. The HMAC + timestamp window
  (5 min) is the contract — rotation lives in SSM Parameter Store.
- Lambda warm cache + Express respond independently; a Lambda redeploy
  flushes the cache but the Express path stays available.
- VPC Link adds a small infra surface but keeps the call inside the VPC.

## Alternatives rejected

- **Lambda-only:** loses RLS as the boundary; auth split + scope drift
  becomes inevitable.
- **EKS-only:** loses the cheap edge cache + a JWT verification path
  that doesn't take up an Express worker thread.
