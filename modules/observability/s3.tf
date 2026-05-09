#This file defines s3 settings for CloudOps.
#Observability buckets.
#All hardening flips via root-level vars (see variables.tf):
#buckets_force_destroy / buckets_versioning / buckets_kms_cmk
#buckets_replication_destination_arn / buckets_replication_role_arn
#buckets_glacier_transition_days / buckets_expiration_days
#
#Defaults are dev-friendly. prod.tfvars flips them.

locals {
  buckets = {
    loki  = "${var.name_prefix}-loki-chunks-${var.aws_account_id}"
    tempo = "${var.name_prefix}-tempo-traces-${var.aws_account_id}"
  }

  bucket_kms_arn = {
    loki  = var.buckets_kms_cmk ? aws_kms_key.loki[0].arn : null
    tempo = var.buckets_kms_cmk ? aws_kms_key.tempo[0].arn : null
  }
}

#── Loki bucket ──────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "loki" {
  bucket        = local.buckets.loki
  force_destroy = var.buckets_force_destroy

  tags = merge(local.common_tags, { Name = local.buckets.loki })
}

#Creates the AWS s3 bucket server side encryption configuration resource named loki.
resource "aws_s3_bucket_server_side_encryption_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.buckets_kms_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = local.bucket_kms_arn.loki
    }
    bucket_key_enabled = var.buckets_kms_cmk
  }
}

#Creates the AWS s3 bucket public access block resource named loki.
resource "aws_s3_bucket_public_access_block" "loki" {
  bucket                  = aws_s3_bucket.loki.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#Creates the AWS s3 bucket versioning resource named loki.
resource "aws_s3_bucket_versioning" "loki" {
  bucket = aws_s3_bucket.loki.id

  versioning_configuration {
    status = var.buckets_versioning ? "Enabled" : "Suspended"
  }
}

#Creates the AWS s3 bucket lifecycle configuration resource named loki.
resource "aws_s3_bucket_lifecycle_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  #Always enabled — handles abort-incomplete-multipart even in minimal setups.
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

  #Old versions are pointless after the live object is purged — dedupe storage.
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

#Creates the AWS s3 bucket replication configuration resource named loki.
resource "aws_s3_bucket_replication_configuration" "loki" {
  count = var.buckets_replication_destination_arn != "" ? 1 : 0

  bucket = aws_s3_bucket.loki.id
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

  depends_on = [aws_s3_bucket_versioning.loki]
}

#── Tempo bucket ─────────────────────────────────────────────────────────────

resource "aws_s3_bucket" "tempo" {
  bucket        = local.buckets.tempo
  force_destroy = var.buckets_force_destroy

  tags = merge(local.common_tags, { Name = local.buckets.tempo })
}

#Creates the AWS s3 bucket server side encryption configuration resource named tempo.
resource "aws_s3_bucket_server_side_encryption_configuration" "tempo" {
  bucket = aws_s3_bucket.tempo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.buckets_kms_cmk ? "aws:kms" : "AES256"
      kms_master_key_id = local.bucket_kms_arn.tempo
    }
    bucket_key_enabled = var.buckets_kms_cmk
  }
}

#Creates the AWS s3 bucket public access block resource named tempo.
resource "aws_s3_bucket_public_access_block" "tempo" {
  bucket                  = aws_s3_bucket.tempo.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

#Creates the AWS s3 bucket versioning resource named tempo.
resource "aws_s3_bucket_versioning" "tempo" {
  bucket = aws_s3_bucket.tempo.id

  versioning_configuration {
    status = var.buckets_versioning ? "Enabled" : "Suspended"
  }
}

#Creates the AWS s3 bucket lifecycle configuration resource named tempo.
resource "aws_s3_bucket_lifecycle_configuration" "tempo" {
  bucket = aws_s3_bucket.tempo.id

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

#Creates the AWS s3 bucket replication configuration resource named tempo.
resource "aws_s3_bucket_replication_configuration" "tempo" {
  count = var.buckets_replication_destination_arn != "" ? 1 : 0

  bucket = aws_s3_bucket.tempo.id
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

  depends_on = [aws_s3_bucket_versioning.tempo]
}
