#This file defines thanos settings for CloudOps.
#Thanos — alternative long-term Prometheus storage (opt-in).
#Deployed only when var.metrics_long_term_storage = "thanos".
#
#Architecture (sidecar mode):
#Prometheus pod runs a Thanos sidecar container that uploads TSDB blocks
#to S3 every 2h. Thanos Querier + Store-Gateway serve historical queries.
#
#Mimir is the recommended path. Thanos is here for users who:
#- already run Thanos elsewhere
#- prefer CNCF graduated governance
#- cannot adopt AGPLv3 (Mimir's license)

locals {
  thanos_bucket_name = "${var.name_prefix}-thanos-blocks-${var.aws_account_id}"
}

#Creates the AWS s3 bucket resource named thanos.
resource "aws_s3_bucket" "thanos" {
  count = var.metrics_long_term_storage == "thanos" ? 1 : 0

  bucket        = local.thanos_bucket_name
  force_destroy = var.buckets_force_destroy

  tags = merge(local.common_tags, { Name = local.thanos_bucket_name, Domain = "observability-thanos" })
}

#Creates the AWS s3 bucket server side encryption configuration resource named thanos.
resource "aws_s3_bucket_server_side_encryption_configuration" "thanos" {
  count  = var.metrics_long_term_storage == "thanos" ? 1 : 0
  bucket = aws_s3_bucket.thanos[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.buckets_kms_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = var.buckets_kms_cmk ? aws_kms_key.mimir[0].arn : null
    }
    bucket_key_enabled = var.buckets_kms_cmk
  }
}

#Creates the AWS s3 bucket public access block resource named thanos.
resource "aws_s3_bucket_public_access_block" "thanos" {
  count                   = var.metrics_long_term_storage == "thanos" ? 1 : 0
  bucket                  = aws_s3_bucket.thanos[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#Creates the AWS s3 bucket versioning resource named thanos.
resource "aws_s3_bucket_versioning" "thanos" {
  count  = var.metrics_long_term_storage == "thanos" ? 1 : 0
  bucket = aws_s3_bucket.thanos[0].id

  versioning_configuration {
    status = var.buckets_versioning ? "Enabled" : "Suspended"
  }
}

#Creates the AWS IAM role resource named thanos.
resource "aws_iam_role" "thanos" {
  count = var.metrics_long_term_storage == "thanos" ? 1 : 0

  name = "${local.name}-thanos-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringLike = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:monitoring:thanos-*"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-thanos-irsa" })
}

#Creates the AWS IAM role policy resource named thanos.
resource "aws_iam_role_policy" "thanos" {
  count = var.metrics_long_term_storage == "thanos" ? 1 : 0

  name = "thanos-s3-access"
  role = aws_iam_role.thanos[0].id

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
        aws_s3_bucket.thanos[0].arn,
        "${aws_s3_bucket.thanos[0].arn}/*",
      ]
    }]
  })
}

#Creates the kubernetes secret resource named thanos objstore.
resource "kubernetes_secret" "thanos_objstore" {
  count = var.metrics_long_term_storage == "thanos" ? 1 : 0

  metadata {
    name      = "thanos-objstore"
    namespace = "monitoring"
  }

  data = {
    "objstore.yml" = yamlencode({
      type = "S3"
      config = {
        bucket   = aws_s3_bucket.thanos[0].id
        endpoint = "s3.${var.region}.amazonaws.com"
        region   = var.region
        sse_config = var.buckets_kms_cmk ? {
          type       = "SSE-KMS"
          kms_key_id = aws_kms_key.mimir[0].arn
        } : null
      }
    })
  }

  depends_on = [kubernetes_namespace.monitoring]
}

#Creates the helm release resource named thanos.
resource "helm_release" "thanos" {
  count = var.metrics_long_term_storage == "thanos" ? 1 : 0

  name       = "thanos"
  repository = "https://charts.bitnami.com/bitnami"
  chart      = "thanos"
  version    = "15.7.13"
  namespace  = "monitoring"

  timeout = 600

  values = [yamlencode({
    existingObjstoreSecret = "thanos-objstore"

    query = {
      enabled      = true
      replicaCount = 2
      stores = [
        #Sidecar inside prometheus pod — set up via Prom helm values when needed.
        #Store-gateway covers the historical S3 path.
        "thanos-storegateway:10901",
      ]
    }

    storegateway = {
      enabled = true
      serviceAccount = {
        create = true
        name   = "thanos-storegateway"
        annotations = {
          "eks.amazonaws.com/role-arn" = aws_iam_role.thanos[0].arn
        }
      }
      persistence = {
        enabled      = true
        size         = "8Gi"
        storageClass = "gp3"
      }
    }

    compactor = {
      enabled = true
      serviceAccount = {
        create = true
        name   = "thanos-compactor"
        annotations = {
          "eks.amazonaws.com/role-arn" = aws_iam_role.thanos[0].arn
        }
      }
      persistence = {
        enabled      = true
        size         = "8Gi"
        storageClass = "gp3"
      }
      retentionResolutionRaw = "30d"
      retentionResolution5m  = "180d"
      retentionResolution1h  = "1y"
    }
  })]

  depends_on = [
    kubernetes_secret.thanos_objstore,
    helm_release.prometheus,
    kubernetes_storage_class.gp3,
  ]
}
