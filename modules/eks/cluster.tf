# Requires hashicorp/tls ~> 4.0 in root providers.tf

# EKS control plane
resource "aws_eks_cluster" "main" {
  #checkov:skip=CKV_AWS_39:Public endpoint intentionally enabled for GitHub Actions OIDC access from CI/CD
  #checkov:skip=CKV_AWS_38:Public endpoint CIDR restriction not applied - GitHub Actions IPs are dynamic
  #checkov:skip=CKV_AWS_58:EKS secrets encryption requires dedicated KMS key - accepted risk for dev environment
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = concat(var.private_subnet_ids, var.public_subnet_ids)
    endpoint_private_access = true
    endpoint_public_access  = true
  }

  enabled_cluster_log_types = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
  ]

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy,
  ]

  tags = merge(local.common_tags, {
    Name = var.cluster_name
  })
}

# Fetch OIDC thumbprint from the cluster's issuer URL
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# OIDC provider — enables IRSA (IAM Roles for Service Accounts)
resource "aws_iam_openid_connect_provider" "main" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-oidc"
  })
}
