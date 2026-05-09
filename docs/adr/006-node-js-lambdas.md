<!-- This document explains 006 node js lambdas for CloudOps. -->
# ADR 006 — Node.js for All Lambda Functions

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

CloudOps uses Lambda functions heavily across multiple modules:

- **SLO module**: error budget tracker, queries Prometheus every 5 minutes
- **Security module**: compliance scanner (runs every 6 hours), auto-remediation (SNS-triggered)
- **FinOps module**: cost ingestion (daily), idle resource detector (daily)
- **Self-healing module**: healing controller (SNS + EventBridge triggered), scale-in scheduler (EventBridge triggered)

All of these Lambda functions need to call AWS APIs (CloudWatch, EKS, RDS, Secrets Manager, S3, DynamoDB, SNS, Lambda, Auto Scaling). Several also need to make Kubernetes API calls via HTTP. The security and self-healing functions call the GitHub API.

The choice of runtime (Node.js vs Python vs Go) would apply uniformly across all functions. A mixed-runtime codebase for a solo-maintained project creates significant cognitive overhead: different SDK versions, different testing frameworks, different packaging tools, different cold-start characteristics.

## Decision

All Lambda functions use Node.js 22.x with AWS SDK v3.

**Consistency with order-api.** The order-api is a Node.js/Express service using `@aws-sdk/client-secrets-manager` for database credentials and `prom-client` for metrics. The Lambda functions use the same AWS SDK v3 packages. When debugging an issue that crosses the application/infrastructure boundary, a single engineer can read all relevant code without a context switch between Python and JavaScript. The `package.json` dependency format, `require()` module loading, and `async/await` patterns are identical.

**AWS SDK v3 ecosystem.** SDK v3 was designed for Lambda: tree-shaking support means each function only bundles the clients it uses, reducing deployment package size. The modular design (`@aws-sdk/client-eks`, `@aws-sdk/client-cloudwatch`, etc.) makes the dependency surface of each Lambda explicit in its `package.json`. The credential chain works the same way in Node.js as in any SDK: IRSA credentials are picked up automatically via `fromNodeProviderChain()`.

**Kubernetes API access.** The self-healing and security Lambda functions need to call the Kubernetes API (to patch deployments, cordon nodes, evict pods, read HPAs). The Kubernetes client library exists in multiple languages, but the STS presign pattern for generating an EKS bearer token (`k8s-aws-v1.<base64url>`) is well-documented for Node.js with `@smithy/signature-v4`. This pattern is already proven in the codebase — `modules/security/lambda_function/auto_remediation/index.js` implemented it first, and `modules/self_healing/lambda_function/index.js` reuses the exact same pattern.

**Cold start performance.** Python is sometimes preferred for cold starts, but at 256MB memory (our default Lambda allocation) the cold start difference between Node.js and Python is small (typically <200ms). For our Lambda invocation patterns — scheduled events running every 5 minutes, SNS triggers in response to alarms — cold starts are acceptable. A 200ms cold start on a function that runs once per hour does not affect user experience.

**npm install packaging.** All functions use `null_resource` + `archive_file` for packaging: trigger on `package.json` and `index.js` hashes, run `npm install --omit=dev`, zip the directory. This pattern is consistent across all Lambda modules. Python would use `pip install -t` instead, a different directory structure, and different exclusion patterns — additional complexity for no benefit.

The notable downside: AWS SDK v3 is **not** included in the Node.js 22.x Lambda runtime (unlike Python's boto3, which is bundled). Every Lambda package must include its `node_modules`. This increases deployment package size by ~5-15MB per function depending on which SDK clients are imported. We accept this because the per-function tree-shaking benefit outweighs the size cost for our deployment frequency.

## Consequences

**Positive:**
- Single language across all Lambda functions and the application — one mental model for all code
- AWS SDK v3 client-per-service packaging makes dependencies explicit and enables tree-shaking
- EKS bearer token (STS presign via `@smithy/signature-v4`) pattern is proven and reusable across multiple functions
- `null_resource` + `archive_file` + `npm install --omit=dev` packaging is consistent across all 5 Lambda modules
- `AWS_NODEJS_CONNECTION_REUSE_ENABLED=1` env var (set on SLO and security Lambdas) enables HTTP keep-alive for AWS SDK connections, reducing latency on warm invocations

**Negative:**
- AWS SDK v3 not bundled in the runtime — every package includes 5-15MB of `node_modules`. Python boto3 is bundled (though this is changing with Lambda deprecating bundled runtimes)
- JavaScript lacks Python's rich data science libraries (pandas, numpy) — not relevant for these functions, but limits future analytics Lambda work
- `npm install` on a CI runner must complete before `terraform apply` can package the function. The `null_resource` triggers handle this, but a fresh clone without `node_modules` will fail `terraform plan` validation of the `archive_file` data source
