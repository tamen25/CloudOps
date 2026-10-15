#VPC Flow Logs.
#Two destination options driven by var.flow_logs_destination:
#"cloudwatch" — quick, queryable, costs per ingested GB. Good for small VPCs.
#"s3"         — cheaper at scale, partitioned for Athena. Recommended for prod.

#── CloudWatch destination ────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  count = var.enable_flow_logs && var.flow_logs_destination == "cloudwatch" ? 1 : 0

  name              = "/aws/vpc/${var.name_prefix}-flow-logs"
  retention_in_days = var.flow_logs_retention_days

  tags = merge(
    local.common_tags,
    { Name = "${var.name_prefix}-vpc-flow-logs" }
  )
}

resource "aws_iam_role" "vpc_flow_logs" {
  count = var.enable_flow_logs && var.flow_logs_destination == "cloudwatch" ? 1 : 0

  name = "${var.name_prefix}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "vpc_flow_logs" {
  count = var.enable_flow_logs && var.flow_logs_destination == "cloudwatch" ? 1 : 0

  name = "${var.name_prefix}-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
}

#── S3 destination (Athena-partitioned) ──────────────────────────────────────

resource "aws_s3_bucket" "flow_logs" {
  count = var.enable_flow_logs && var.flow_logs_destination == "s3" ? 1 : 0

  bucket        = "${var.name_prefix}-vpc-flow-logs-${var.aws_account_id}"
  force_destroy = var.buckets_force_destroy

  tags = merge(
    local.common_tags,
    { Name = "${var.name_prefix}-vpc-flow-logs" }
  )
}

resource "aws_s3_bucket_server_side_encryption_configuration" "flow_logs" {
  count  = var.enable_flow_logs && var.flow_logs_destination == "s3" ? 1 : 0
  bucket = aws_s3_bucket.flow_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "flow_logs" {
  count                   = var.enable_flow_logs && var.flow_logs_destination == "s3" ? 1 : 0
  bucket                  = aws_s3_bucket.flow_logs[0].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "flow_logs" {
  count  = var.enable_flow_logs && var.flow_logs_destination == "s3" ? 1 : 0
  bucket = aws_s3_bucket.flow_logs[0].id

  rule {
    id     = "expire"
    status = "Enabled"
    filter {}
    expiration {
      days = var.flow_logs_retention_days
    }
  }
}

#── Flow log resource ────────────────────────────────────────────────────────

resource "aws_flow_log" "main" {
  count = var.enable_flow_logs ? 1 : 0

  vpc_id       = aws_vpc.main.id
  traffic_type = "ALL"

  #CloudWatch path
  iam_role_arn         = var.flow_logs_destination == "cloudwatch" ? aws_iam_role.vpc_flow_logs[0].arn : null
  log_destination_type = var.flow_logs_destination == "cloudwatch" ? "cloud-watch-logs" : "s3"
  log_destination = (
    var.flow_logs_destination == "cloudwatch" ?
    aws_cloudwatch_log_group.vpc_flow_logs[0].arn :
    aws_s3_bucket.flow_logs[0].arn
  )

  #Athena-partition-friendly format when going to S3.
  destination_options {
    file_format                = var.flow_logs_destination == "s3" ? "parquet" : null
    hive_compatible_partitions = var.flow_logs_destination == "s3" ? true : null
    per_hour_partition         = var.flow_logs_destination == "s3" ? true : null
  }

  tags = merge(
    local.common_tags,
    { Name = "${var.name_prefix}-vpc-flow-logs" }
  )
}
