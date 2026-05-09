#This file defines external secrets settings for CloudOps.
#External Secrets Operator (ESO) — pulls AWS Secrets Manager values into k8s
#Secret resources without ever putting plaintext in TF state or git.
#
#Pattern: define an `ExternalSecret` referencing a Secrets Manager ARN; the
#operator creates / refreshes a k8s Secret. Apps mount the Secret normally.

resource "aws_iam_role" "external_secrets" {
  count = var.enable_external_secrets ? 1 : 0

  name = "${var.project_name}-${var.environment}-external-secrets-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:external-secrets:external-secrets"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = var.tags
}

#Creates the AWS IAM role policy resource named external secrets.
resource "aws_iam_role_policy" "external_secrets" {
  count = var.enable_external_secrets ? 1 : 0

  name = "external-secrets-read"
  role = aws_iam_role.external_secrets[0].id

  #Resource scoping (closes backlog #22 + #37):
  #- GetSecretValue / DescribeSecret are limited to var.external_secrets_allowed_arns when set.
  #- ListSecrets cannot be resource-scoped by the Secrets Manager API and stays "*".
  #- Non-dev environments MUST provide an explicit ARN list (precondition below).
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadSecrets"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = length(var.external_secrets_allowed_arns) > 0 ? var.external_secrets_allowed_arns : ["*"]
      },
      {
        Sid      = "ListSecrets"
        Effect   = "Allow"
        Action   = ["secretsmanager:ListSecrets"]
        Resource = "*"
      },
    ]
  })

  lifecycle {
    precondition {
      condition     = var.environment == "dev" || length(var.external_secrets_allowed_arns) > 0
      error_message = "external_secrets_allowed_arns must be a non-empty list in environment=${var.environment}. The dev fallback to Resource=\"*\" is not allowed in staging/prod (backlog #37)."
    }
  }
}

#Creates the helm release resource named external secrets.
resource "helm_release" "external_secrets" {
  count = var.enable_external_secrets ? 1 : 0

  name       = "external-secrets"
  repository = "https://charts.external-secrets.io"
  chart      = "external-secrets"
  version    = "0.10.4"
  namespace  = "external-secrets"

  create_namespace = true
  timeout          = 300

  set {
    name  = "serviceAccount.annotations.eks\\.amazonaws\\.com/role-arn"
    value = aws_iam_role.external_secrets[0].arn
  }

  set {
    name  = "installCRDs"
    value = "true"
  }
}

#Default ClusterSecretStore — backed by AWS Secrets Manager via IRSA.
#Pre-installed so app teams can write `kind: ExternalSecret` immediately.
resource "kubernetes_manifest" "cluster_secret_store" {
  count = var.enable_external_secrets ? 1 : 0

  manifest = {
    apiVersion = "external-secrets.io/v1beta1"
    kind       = "ClusterSecretStore"
    metadata = {
      name = "aws-secrets-manager"
    }
    spec = {
      provider = {
        aws = {
          service = "SecretsManager"
          region  = var.region
          auth = {
            jwt = {
              serviceAccountRef = {
                name      = "external-secrets"
                namespace = "external-secrets"
              }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.external_secrets]
}
