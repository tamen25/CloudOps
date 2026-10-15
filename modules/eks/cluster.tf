#This file defines cluster settings for CloudOps.
#Requires hashicorp/tls ~> 4.0 in root providers.tf

#EKS control plane.
#Closes backlog #42 — public endpoint access is now configurable. Production
#should set `endpoint_public_access = false` (private only, reachable from
#the VPC via private runners / VPN / bastion) OR keep public on with a
#tightly scoped `public_access_cidrs` list (emergency access from a known
#admin range). Defaults stay open for the dev workflow that uses GitHub
#Actions hosted runners with dynamic IPs.
resource "aws_eks_cluster" "main" {
  #checkov:skip=CKV_AWS_39:Public endpoint intentionally enabled for GitHub Actions OIDC access from CI/CD
  #checkov:skip=CKV_AWS_38:Public endpoint CIDR restriction not applied - GitHub Actions IPs are dynamic
  #CKV_AWS_58 (EKS secrets encryption) is now gated on env via
  #local.secrets_encryption_enabled — staging/prod get a CMK, dev opts out
  #to keep overnight teardown cheap (closes backlog #111).
  name     = var.cluster_name
  role_arn = aws_iam_role.eks_cluster.arn
  version  = var.kubernetes_version

  vpc_config {
    subnet_ids              = concat(var.private_subnet_ids, var.public_subnet_ids)
    endpoint_private_access = var.endpoint_private_access
    endpoint_public_access  = var.endpoint_public_access
    public_access_cidrs     = var.endpoint_public_access ? var.endpoint_public_access_cidrs : null
  }

  dynamic "encryption_config" {
    for_each = local.secrets_encryption_enabled ? [1] : []
    content {
      resources = ["secrets"]
      provider {
        key_arn = aws_kms_key.eks_secrets[0].arn
      }
    }
  }

  #API_AND_CONFIG_MAP lets us manage cluster access via aws-auth ConfigMap *and*
  #native EKS Access Entries. Switched on out-of-band during an LBC debug session;
  #codified here so a future apply does not show drift back to CONFIG_MAP.
  access_config {
    authentication_mode                         = "API_AND_CONFIG_MAP"
    bootstrap_cluster_creator_admin_permissions = true
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

#Fetch OIDC thumbprint from the cluster's issuer URL
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

#OIDC provider — enables IRSA (IAM Roles for Service Accounts)
resource "aws_iam_openid_connect_provider" "main" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer

  tags = merge(local.common_tags, {
    Name = "${var.cluster_name}-oidc"
  })
}
