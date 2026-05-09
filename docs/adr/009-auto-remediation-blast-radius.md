<!-- This document explains 009 auto remediation blast radius for CloudOps. -->
# ADR 009 — Auto-Remediation Blast Radius Limits

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

CloudOps runs two automated remediation systems:

1. **Security auto-remediation** (`modules/security/auto_remediation.tf`): triggered by HIGH/CRITICAL findings from the compliance scanner via SNS, corrects misconfigured AWS resources
2. **Self-healing controller** (`modules/self_healing/lambda_function/index.js`): triggered by CloudWatch Alarms and EventBridge pod failure events, responds to operational incidents

Both systems have the capability to take actions that could cause more harm than good if applied incorrectly. A Lambda that can restart deployments, cordon nodes, and reboot RDS instances is also a Lambda that can cause a major outage if its alarm routing logic fires on a false positive.

The question was: where do you draw the line between "safe to automate" and "requires human approval"?

## Decision

We define a hard boundary between safe and unsafe remediation actions. Safe actions are automated; unsafe actions create a GitHub issue and stop.

**Safe actions — automated without human review:**

For security findings:
- Enable S3 `PublicAccessBlock` on a bucket that has public access enabled (no data loss risk, always correct to apply)
- Revoke security group rules with `0.0.0.0/0` on unexpected ports (network isolation, highly reversible via console)
- Enable RDS deletion protection in production (adds a safety guard, does not change data or availability)
- Enable S3 versioning on buckets without it (additive, no existing objects affected)

For operational healing:
- Scale-out (increase HPA `minReplicas`) when pod count is low or latency is high — adds capacity, never removes it
- Rollout restart when error rate exceeds threshold — Kubernetes does this gracefully with zero downtime for a healthy deployment
- Cordon a NotReady node — prevents new pods from being scheduled on a broken node, does not evict running pods
- ASG instance refresh when nodes are unhealthy — replaces nodes one at a time with the drain lifecycle

**Unsafe actions — GitHub issue created, human must act:**

For security:
- Wildcard IAM policies (`Action: *` or `Resource: *`) — removing these could break a legitimate use case; human must evaluate
- RDS publicly accessible — disabling this changes connectivity for all clients; requires coordinating with application teams
- EKS public API endpoint — disabling public access changes how engineers access the cluster; requires planning
- Unused IAM roles — "unused" might mean a role is reserved for a seasonal workload or disaster recovery

For operational:
- Database reboots — RDS `RebootDBInstance` causes ~30-60 seconds of downtime; human must decide if the timing is acceptable
- Rollback of a deployment that continues to have high errors after a scale-out attempt — the Lambda *does* trigger a rollout restart automatically, but a failed restart loops back to human review via GitHub issue rather than attempting repeated restarts
- Scaling beyond `MAX_SCALE_OUT_PODS` — the cap is explicit in the environment variable

**Forensics preservation for security incidents.** The auto-remediation Lambda explicitly does NOT attempt to clean up after a Falco CRITICAL finding (e.g., shell spawned in a pod, unexpected `execve`). Instead, it quarantines the pod (removes it from the Service selector via label patch) but leaves it running for forensic analysis, then creates a HIGH-priority GitHub issue. Killing the pod destroys the evidence.

**DRY_RUN mode.** Both Lambda functions respect a `DRY_RUN` environment variable (defaulting to `true` in `terraform.tfvars.example` for self-healing). In DRY_RUN mode, all actions are logged with `{"dryRun": true}` but no AWS or Kubernetes API mutations are made. This allows validation of alarm routing, event parsing, and action selection logic in production without risk.

The `dry_run = true` default for self-healing was a deliberate choice: the self-healing alarms firing on real infrastructure should be validated against actual alarm conditions before enabling mutations. An engineer enabling self-healing in a new environment should observe at least one full alarm cycle in DRY_RUN before setting `dry_run = false`.

## Consequences

**Positive:**
- False positive alarms and misconfigured alarm thresholds cannot cause automated outages — they will create GitHub issues instead
- The DRY_RUN path provides a full audit trail of what would have been done without risk
- Forensics are preserved for security incidents: quarantine rather than terminate
- The blast radius of a compromised Lambda function is bounded: it can adjust SG rules, HPA replicas, and S3 public access settings, but it cannot delete databases, modify IAM policies, or terminate EC2 instances
- GitHub issues created by automated remediation provide a persistent audit trail with timestamps, alarm context, and resource state

**Negative:**
- Human-required actions create GitHub issues but have no escalation path if the issue is ignored. In production, this should be integrated with PagerDuty or a similar on-call system
- The safety/unsafe boundary is opinionated — a different team might consider automated RDS reboots acceptable. The categorization is hardcoded in the Lambda; changing the boundary requires a code change and redeployment
- DRY_RUN default means self-healing provides no actual protection until an engineer explicitly changes `self_healing_dry_run = false` in `terraform.tfvars`. This is intentional but easy to forget, leaving the system in a "looks like it's protecting you but isn't" state
- Scale-in after scale-out (the `cloudops-scale-in-scheduler` Lambda) runs 30 minutes after a scale-out event regardless of whether the underlying issue is resolved. This could cause a second alarm cycle if the root cause is still active
