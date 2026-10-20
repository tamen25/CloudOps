#This file defines mimir settings for CloudOps.
#Mimir — long-term Prometheus storage backend (default for prod).
#Deployed only when var.metrics_long_term_storage = "mimir".
#
#Architecture:
#Prometheus -- remote_write --> Mimir distributor
#Mimir ingester -- TSDB blocks --> S3 (mimir bucket)
#Mimir querier <-- query path -- Grafana datasource
#
#Same hardening flags as Loki/Tempo buckets (versioning, KMS CMK, lifecycle,
#replication, force_destroy).

locals {
  mimir_bucket_name = "${var.name_prefix}-mimir-blocks-${var.aws_account_id}"
}

#Creates the AWS s3 bucket resource named mimir.
resource "aws_s3_bucket" "mimir" {
  count = var.metrics_long_term_storage == "mimir" ? 1 : 0

  bucket        = local.mimir_bucket_name
  force_destroy = var.buckets_force_destroy

  tags = merge(local.common_tags, { Name = local.mimir_bucket_name, Domain = "observability-mimir" })
}

#Creates the AWS s3 bucket server side encryption configuration resource named mimir.
resource "aws_s3_bucket_server_side_encryption_configuration" "mimir" {
  count  = var.metrics_long_term_storage == "mimir" ? 1 : 0
  bucket = aws_s3_bucket.mimir[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.buckets_kms_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = var.buckets_kms_cmk ? aws_kms_key.mimir[0].arn : null
    }
    bucket_key_enabled = var.buckets_kms_cmk
  }
}

#Creates the AWS s3 bucket public access block resource named mimir.
resource "aws_s3_bucket_public_access_block" "mimir" {
  count                   = var.metrics_long_term_storage == "mimir" ? 1 : 0
  bucket                  = aws_s3_bucket.mimir[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#Creates the AWS s3 bucket versioning resource named mimir.
resource "aws_s3_bucket_versioning" "mimir" {
  count  = var.metrics_long_term_storage == "mimir" ? 1 : 0
  bucket = aws_s3_bucket.mimir[0].id

  versioning_configuration {
    status = var.buckets_versioning ? "Enabled" : "Suspended"
  }
}

#Creates the AWS s3 bucket lifecycle configuration resource named mimir.
resource "aws_s3_bucket_lifecycle_configuration" "mimir" {
  count  = var.metrics_long_term_storage == "mimir" ? 1 : 0
  bucket = aws_s3_bucket.mimir[0].id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = var.buckets_glacier_transition_days > 0 ? [1] : []
    content {
      id     = "glacier-transition"
      status = "Enabled"
      filter {}
      transition {
        days          = var.buckets_glacier_transition_days
        storage_class = "GLACIER"
      }
    }
  }

  dynamic "rule" {
    for_each = var.buckets_expiration_days > 0 ? [1] : []
    content {
      id     = "expire"
      status = "Enabled"
      filter {}
      expiration {
        days = var.buckets_expiration_days
      }
    }
  }

  dynamic "rule" {
    for_each = var.buckets_versioning ? [1] : []
    content {
      id     = "expire-noncurrent-versions"
      status = "Enabled"
      filter {}
      noncurrent_version_expiration {
        noncurrent_days = 30
      }
    }
  }
}

#Creates the AWS s3 bucket replication configuration resource named mimir.
resource "aws_s3_bucket_replication_configuration" "mimir" {
  count = var.metrics_long_term_storage == "mimir" && var.buckets_replication_destination_arn != "" ? 1 : 0

  bucket = aws_s3_bucket.mimir[0].id
  role   = var.buckets_replication_role_arn

  rule {
    id     = "replicate-all"
    status = "Enabled"

    destination {
      bucket        = var.buckets_replication_destination_arn
      storage_class = "STANDARD_IA"
    }

    delete_marker_replication {
      status = "Enabled"
    }
  }

  depends_on = [aws_s3_bucket_versioning.mimir]
}

#── IRSA ─────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "mimir" {
  count = var.metrics_long_term_storage == "mimir" ? 1 : 0

  name = "${local.name}-mimir-irsa"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:mimir:mimir"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-mimir-irsa" })
}

#Creates the AWS IAM role policy resource named mimir.
resource "aws_iam_role_policy" "mimir" {
  count = var.metrics_long_term_storage == "mimir" ? 1 : 0

  name = "mimir-s3-access"
  role = aws_iam_role.mimir[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      [{
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = [
          aws_s3_bucket.mimir[0].arn,
          "${aws_s3_bucket.mimir[0].arn}/*",
        ]
      }],
      var.buckets_kms_cmk ? [{
        Effect   = "Allow"
        Action   = ["kms:Encrypt", "kms:Decrypt", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:DescribeKey"]
        Resource = aws_kms_key.mimir[0].arn
      }] : []
    )
  })
}

#── Helm release ─────────────────────────────────────────────────────────────

resource "helm_release" "mimir" {
  count = var.metrics_long_term_storage == "mimir" ? 1 : 0

  name       = "mimir"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "mimir-distributed"
  version    = "5.4.1"
  namespace  = "mimir"

  create_namespace = true
  timeout          = 600

  values = [yamlencode({
    serviceAccount = {
      create = true
      name   = "mimir"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.mimir[0].arn
      }
    }

    mimir = {
      structuredConfig = {
        common = {
          storage = merge(
            {
              backend = "s3"
              s3 = {
                bucket_name = aws_s3_bucket.mimir[0].id
                region      = var.region
                endpoint    = "s3.${var.region}.amazonaws.com"
              }
            },
            var.buckets_kms_cmk ? {
              s3 = {
                bucket_name = aws_s3_bucket.mimir[0].id
                region      = var.region
                endpoint    = "s3.${var.region}.amazonaws.com"
                sse = {
                  type       = "SSE-KMS"
                  kms_key_id = aws_kms_key.mimir[0].arn
                }
              }
            } : {}
          )
        }

        #Multi-tenant disabled — single-tenant via X-Scope-OrgID = "anonymous"
        multitenancy_enabled = false

        limits = {
          ingestion_rate             = 100000
          max_global_series_per_user = 1000000
          # Serves /api/v1/cardinality/*: series counts per label value,
          # read by Argus (its MET-001 check and cost attribution) and by
          # anyone chasing a cardinality spike. Read-only, on demand.
          cardinality_analysis_enabled = true
        }
      }
    }

    #Disable bundled MinIO — using AWS S3.
    minio = {
      enabled = false
    }

    #Microservices mode: distributor / ingester / querier / store-gateway / compactor.
    #Defaults are conservative; bump replicas via tfvars overrides for prod.
    distributor = {
      replicas = 1
    }
    ingester = {
      replicas = 1
      persistence = {
        enabled      = true
        size         = "10Gi"
        storageClass = "gp3"
      }
    }
    querier = {
      replicas = 1
    }
    "query-frontend" = {
      replicas = 1
    }
    "store-gateway" = {
      replicas = 1
      persistence = {
        enabled      = true
        size         = "5Gi"
        storageClass = "gp3"
      }
    }
    compactor = {
      replicas = 1
      persistence = {
        enabled      = true
        size         = "5Gi"
        storageClass = "gp3"
      }
    }
    ruler = {
      replicas = 1
    }
  })]

  depends_on = [
    kubernetes_storage_class.gp3,
    helm_release.prometheus,
  ]
}
