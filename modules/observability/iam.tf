# IRSA role for Loki — scoped to service account loki/loki
resource "aws_iam_role" "loki" {
  name = "${local.name}-loki-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:loki:loki"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-loki-irsa" })
}

resource "aws_iam_role_policy" "loki" {
  name = "loki-s3-access"
  role = aws_iam_role.loki.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ]
      Resource = [
        aws_s3_bucket.loki.arn,
        "${aws_s3_bucket.loki.arn}/*",
      ]
    }]
  })
}

# IRSA role for Tempo — scoped to service account tempo/tempo
resource "aws_iam_role" "tempo" {
  name = "${local.name}-tempo-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:tempo:tempo"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-tempo-irsa" })
}

resource "aws_iam_role_policy" "tempo" {
  name = "tempo-s3-access"
  role = aws_iam_role.tempo.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket",
        "s3:GetBucketLocation",
      ]
      Resource = [
        aws_s3_bucket.tempo.arn,
        "${aws_s3_bucket.tempo.arn}/*",
      ]
    }]
  })
}
