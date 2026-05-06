# CloudTrail — multi-region trail with log file validation.
# Object Lock is gated by var.cloudtrail_object_lock_enabled (test envs OFF).

locals {
  ct_bucket_name = "${var.name_prefix}-cloudtrail-${var.aws_account_id}"
}

resource "aws_s3_bucket" "cloudtrail" {
  count = var.enable_cloudtrail ? 1 : 0

  bucket              = local.ct_bucket_name
  force_destroy       = var.cloudtrail_buckets_force_destroy
  object_lock_enabled = var.cloudtrail_object_lock_enabled

  tags = merge(var.tags, { Name = local.ct_bucket_name, Domain = "audit-cloudtrail" })
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cloudtrail" {
  count                   = var.enable_cloudtrail ? 1 : 0
  bucket                  = aws_s3_bucket.cloudtrail[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_object_lock_configuration" "cloudtrail" {
  count  = var.enable_cloudtrail && var.cloudtrail_object_lock_enabled ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  rule {
    default_retention {
      mode = "COMPLIANCE"
      days = var.cloudtrail_object_lock_retention_days
    }
  }
}

resource "aws_s3_bucket_policy" "cloudtrail" {
  count  = var.enable_cloudtrail ? 1 : 0
  bucket = aws_s3_bucket.cloudtrail[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AWSCloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = aws_s3_bucket.cloudtrail[0].arn
      },
      {
        Sid       = "AWSCloudTrailWrite"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.cloudtrail[0].arn}/AWSLogs/${var.aws_account_id}/*"
        Condition = {
          StringEquals = { "s3:x-amz-acl" = "bucket-owner-full-control" }
        }
      },
    ]
  })
}

resource "aws_cloudtrail" "main" {
  count = var.enable_cloudtrail ? 1 : 0

  name                          = "${var.name_prefix}-trail"
  s3_bucket_name                = aws_s3_bucket.cloudtrail[0].id
  is_multi_region_trail         = true
  include_global_service_events = true
  enable_log_file_validation    = true

  tags = merge(var.tags, { Name = "${var.name_prefix}-trail" })

  depends_on = [aws_s3_bucket_policy.cloudtrail]
}
