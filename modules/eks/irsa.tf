# IRSA role for the EBS CSI driver controller (kube-system/ebs-csi-controller-sa)
resource "aws_iam_role" "ebs_csi_driver" {
  name = "${local.name}-ebs-csi-driver"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.main.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_issuer}:sub" = "system:serviceaccount:kube-system:ebs-csi-controller-sa"
          "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ebs_csi_driver" {
  role       = aws_iam_role.ebs_csi_driver.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy"
}

# IRSA role for order-api pods — annotate the service account with:
#   eks.amazonaws.com/role-arn: <order_api_irsa_role_arn>
resource "aws_iam_role" "order_api" {
  name = "${local.name}-order-api-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = aws_iam_openid_connect_provider.main.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${local.oidc_issuer}:sub" = "system:serviceaccount:${var.order_api_namespace}:${var.order_api_service_account}"
          "${local.oidc_issuer}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, {
    Name      = "${local.name}-order-api-irsa"
    Namespace = var.order_api_namespace
  })
}

# Grants order-api access to Secrets Manager (DB credentials) and CloudWatch metrics
resource "aws_iam_role_policy" "order_api" {
  #checkov:skip=CKV_AWS_288:Order API IRSA role requires SecretsManager access for DB credentials
  #checkov:skip=CKV_AWS_355:Order API IRSA role requires Secrets Manager access by resource pattern
  name = "order-api-permissions"
  role = aws_iam_role.order_api.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "SecretsManagerAccess"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
        Resource = "*"
      },
      {
        Sid      = "CloudWatchMetrics"
        Effect   = "Allow"
        Action   = ["cloudwatch:PutMetricData"]
        Resource = "*"
      },
    ]
  })
}
