<!-- This document explains 005 irsa over node role for CloudOps. -->
# ADR 005 — IRSA over Node-Level IAM Roles

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

Pods running on EKS need AWS API access for legitimate reasons: the order-api needs to read database credentials from Secrets Manager; the EBS CSI driver needs to create and attach EBS volumes; the OTel Collector needs to write metrics to CloudWatch; the SLO Lambda needs to describe the EKS cluster.

The historically common approach was to attach permissions to the EC2 node's IAM instance profile. Any pod on that node could then call `169.254.169.254` (the IMDSv2 endpoint) and get credentials for the node role — including permissions for all other pods running on the same node.

IAM Roles for Service Accounts (IRSA) is the alternative: each Kubernetes ServiceAccount is annotated with an IAM role ARN, and AWS uses the EKS OIDC provider to let pods assume that role via `sts:AssumeRoleWithWebIdentity`. The pod gets short-lived credentials scoped to exactly the role bound to its ServiceAccount — no more, no less.

## Decision

All AWS API access in CloudOps uses IRSA. Node instance profiles exist for the minimum permissions required by the EKS node bootstrapping process (kubelet, CNI plugin); no application-level permissions are attached at the node level.

The OIDC provider is created in `modules/eks/cluster.tf`:

```hcl
resource "aws_iam_openid_connect_provider" "main" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}
```

Each service account that needs AWS access gets its own IAM role with a trust policy scoped to a specific namespace and ServiceAccount name:

```hcl
Condition = {
  StringEquals = {
    "${local.oidc_issuer}:sub" = "system:serviceaccount:${var.order_api_namespace}:${var.order_api_service_account}"
    "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
  }
}
```

This means the order-api IRSA role can only be assumed by pods running as the `order-api` ServiceAccount in the `cloudops` namespace. A compromised pod in a different namespace or running as a different ServiceAccount cannot assume this role.

The roles defined in `modules/eks/irsa.tf`:

- **ebs-csi-driver**: assumes `AmazonEBSCSIDriverPolicy` — scoped to `kube-system/ebs-csi-controller-sa`
- **order-api**: `secretsmanager:GetSecretValue` + `cloudwatch:PutMetricData` — scoped to `cloudops/order-api`

Additional IRSA roles are created in `modules/observability/iam.tf` for Loki (S3 read/write for chunks bucket) and Tempo (S3 read/write for traces bucket).

**Audit trail.** With node roles, CloudTrail shows API calls from the node's role ARN — you cannot tell which pod made which call. With IRSA, each assumed role has a unique session name (`pod-name@cluster-id`), so CloudTrail shows exactly which pod called which API. For compliance audits, this is the difference between "the node called S3" and "the loki-ingester-0 pod called S3."

**Blast radius on compromise.** If an attacker gains code execution in an order-api pod with node-level credentials, they have Secrets Manager access for all workloads, S3 access for state and log buckets, and potentially IAM permissions depending on what's attached to the node role. With IRSA, a compromised order-api pod has only: `secretsmanager:GetSecretValue` on `*` (intentionally broad, scoped by secret naming convention) and `cloudwatch:PutMetricData`. Lateral movement to other services' data requires also compromising their ServiceAccount tokens.

## Consequences

**Positive:**
- Each pod has exactly the permissions it needs — least privilege at the service account level, not the node level
- CloudTrail attribution is per-pod-identity, not per-node — actionable during incident investigation
- Compromise of one pod's credentials doesn't grant access to other pods' AWS resources
- Credential rotation is handled by the AWS SDK automatically (credentials expire in ~1 hour); no manual rotation required
- IRSA is an EKS primitive that works the same way on EKS Anywhere and with Kubernetes on-prem using the same OIDC pattern

**Negative:**
- IRSA configuration requires: OIDC provider (1 resource), IAM role (1 per service), trust policy (1 per role), policy attachment (1 per permission set), ServiceAccount annotation (outside Terraform scope)
- If the ServiceAccount annotation is missing or wrong, the pod silently falls back to no credentials (or node credentials if IMDSv2 hop limit is set permissively)
- The OIDC thumbprint occasionally changes when AWS rotates the EKS OIDC provider certificate. This requires updating the `thumbprint_list` in Terraform — `data.tls_certificate.eks` handles this automatically on re-apply
