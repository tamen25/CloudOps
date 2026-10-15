#Dedicated CMK for EKS Kubernetes Secrets envelope encryption (closes backlog #111).
#Gated on local.secrets_encryption_enabled — auto-enabled for staging/prod; dev
#stays off so overnight teardown does not orphan KMS keys (still billable for
#7-day deletion window even when unused).
resource "aws_kms_key" "eks_secrets" {
  count = local.secrets_encryption_enabled ? 1 : 0

  description             = "EKS Kubernetes Secrets envelope encryption — ${local.name}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(local.common_tags, {
    Name      = "${local.name}-eks-secrets"
    Component = "eks-secrets-encryption"
  })
}

resource "aws_kms_alias" "eks_secrets" {
  count = local.secrets_encryption_enabled ? 1 : 0

  name          = "alias/${local.name}-eks-secrets"
  target_key_id = aws_kms_key.eks_secrets[0].key_id
}

#Allow the EKS cluster service role to use the CMK for envelope encryption
#of Kubernetes Secrets. KMS keys deny cross-principal access by default;
#`AmazonEKSClusterPolicy` grants kms:DescribeKey but envelope ops
#(Encrypt/Decrypt/GenerateDataKey) require a key-side or role-side grant.
resource "aws_iam_role_policy" "eks_secrets_kms" {
  count = local.secrets_encryption_enabled ? 1 : 0

  name = "${local.name}-eks-secrets-kms"
  role = aws_iam_role.eks_cluster.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "kms:Encrypt",
        "kms:Decrypt",
        "kms:ReEncrypt*",
        "kms:GenerateDataKey*",
        "kms:DescribeKey",
      ]
      Resource = aws_kms_key.eks_secrets[0].arn
    }]
  })
}
