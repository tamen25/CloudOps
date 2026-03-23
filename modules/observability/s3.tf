# S3 bucket for Loki chunk storage
resource "aws_s3_bucket" "loki" {
  bucket        = "cloudops-loki-chunks-${var.aws_account_id}"
  force_destroy = true

  tags = merge(local.common_tags, { Name = "cloudops-loki-chunks-${var.aws_account_id}" })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "loki" {
  bucket                  = aws_s3_bucket.loki.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Transition to Glacier after 30 days
resource "aws_s3_bucket_lifecycle_configuration" "loki" {
  bucket = aws_s3_bucket.loki.id

  rule {
    id     = "glacier-after-30-days"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }
}

# S3 bucket for Tempo trace storage
resource "aws_s3_bucket" "tempo" {
  bucket        = "cloudops-tempo-traces-${var.aws_account_id}"
  force_destroy = true

  tags = merge(local.common_tags, { Name = "cloudops-tempo-traces-${var.aws_account_id}" })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tempo" {
  bucket = aws_s3_bucket.tempo.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "tempo" {
  bucket                  = aws_s3_bucket.tempo.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "tempo" {
  bucket = aws_s3_bucket.tempo.id

  rule {
    id     = "glacier-after-30-days"
    status = "Enabled"

    filter {}

    transition {
      days          = 30
      storage_class = "GLACIER"
    }
  }
}
