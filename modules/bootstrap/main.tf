# CloudOps Bootstrap Module
# Creates KMS keys and IAM deployer role
# S3 bucket is created via bash script

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
  }

  deployer_role_name = "${var.project_name}-deployer"
  bucket_name        = var.bucket_name != "" ? var.bucket_name : "${var.project_name}-tfstate-bucket"
}

# KMS Key for S3 Bucket Encryption (Optional)

resource "aws_kms_key" "terraform_state" {
  count = var.create_kms ? 1 : 0

  description             = "${var.project_name} Terraform state encryption key"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-tfstate-kms"
    }
  )
}

resource "aws_kms_alias" "terraform_state" {
  count = var.create_kms ? 1 : 0

  name          = "alias/${var.project_name}-tfstate-kms"
  target_key_id = aws_kms_key.terraform_state[0].key_id
}

# Data source for S3 bucket (created by bash script)

data "aws_s3_bucket" "terraform_state" {
  bucket = local.bucket_name
}

# IAM Role for CloudOps Deployer

data "aws_iam_policy_document" "deployer_assume_role" {
  statement {
    effect = "Allow"

    principals {
      type = "AWS"
      identifiers = concat(
        ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"],
        var.additional_trusted_arns
      )
    }

    actions = ["sts:AssumeRole"]

    # Optional: Require MFA
    dynamic "condition" {
      for_each = var.require_mfa ? [1] : []
      content {
        test     = "Bool"
        variable = "aws:MultiFactorAuthPresent"
        values   = ["true"]
      }
    }

    # Optional: Require external ID
    dynamic "condition" {
      for_each = var.external_id != "" ? [1] : []
      content {
        test     = "StringEquals"
        variable = "sts:ExternalId"
        values   = [var.external_id]
      }
    }
  }
}

resource "aws_iam_role" "deployer" {
  name               = local.deployer_role_name
  assume_role_policy = data.aws_iam_policy_document.deployer_assume_role.json
  description        = "${var.project_name} infrastructure deployer role"

  max_session_duration = var.max_session_duration

  tags = merge(
    local.common_tags,
    {
      Name = local.deployer_role_name
    }
  )
}

# Policy for Terraform state management (S3 access only, no DynamoDB)
data "aws_iam_policy_document" "deployer_state_access" {
  statement {
    sid    = "TerraformStateS3Access"
    effect = "Allow"

    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation",
    ]

    resources = [
      data.aws_s3_bucket.terraform_state.arn
    ]
  }

  statement {
    sid    = "TerraformStateS3ObjectAccess"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]

    resources = [
      "${data.aws_s3_bucket.terraform_state.arn}/*"
    ]
  }

  # KMS permissions if enabled
  dynamic "statement" {
    for_each = var.create_kms ? [1] : []
    content {
      sid    = "TerraformStateKMSAccess"
      effect = "Allow"

      actions = [
        "kms:Decrypt",
        "kms:Encrypt",
        "kms:DescribeKey",
        "kms:GenerateDataKey",
      ]

      resources = [aws_kms_key.terraform_state[0].arn]
    }
  }
}

resource "aws_iam_role_policy" "deployer_state_access" {
  name   = "${local.deployer_role_name}-state-access"
  role   = aws_iam_role.deployer.id
  policy = data.aws_iam_policy_document.deployer_state_access.json
}

# Full admin policy for infrastructure deployment
data "aws_iam_policy_document" "deployer_infrastructure" {
  statement {
    sid    = "InfrastructureDeployment"
    effect = "Allow"
    actions = [
      "ec2:*",
      "ecs:*",
      "ecr:*",
      "elasticloadbalancing:*",
      "autoscaling:*",
      "cloudwatch:*",
      "logs:*",
      "iam:*",
      "rds:*",
      "vpc:*",
      "route53:*",
      "acm:*",
      "secretsmanager:*",
      "ssm:*",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deployer_infrastructure" {
  name   = "${local.deployer_role_name}-infrastructure"
  role   = aws_iam_role.deployer.id
  policy = data.aws_iam_policy_document.deployer_infrastructure.json
}

# Attach additional managed policies if provided
resource "aws_iam_role_policy_attachment" "additional_policies" {
  count = length(var.additional_policy_arns)

  role       = aws_iam_role.deployer.name
  policy_arn = var.additional_policy_arns[count.index]
}
