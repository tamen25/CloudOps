#This file defines IAM settings for CloudOps.
#Defines the trust policy for the deployer role, allowing trusted principals to assume it
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

    dynamic "condition" {
      for_each = var.require_mfa ? [1] : []
      content {
        test     = "Bool"
        variable = "aws:MultiFactorAuthPresent"
        values   = ["true"]
      }
    }

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

#Creates an IAM role for deploying infrastructure with Terraform
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

#Defines permissions for accessing the Terraform state S3 bucket and KMS encryption key
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

#Attaches the Terraform state access policy to the deployer role
resource "aws_iam_role_policy" "deployer_state_access" {
  name   = "${local.deployer_role_name}-state-access"
  role   = aws_iam_role.deployer.id
  policy = data.aws_iam_policy_document.deployer_state_access.json
}

#Defines broad permissions for deploying AWS infrastructure resources
data "aws_iam_policy_document" "deployer_infrastructure" {
  #checkov:skip=CKV_AWS_356:Deployer role requires broad infrastructure permissions for Terraform
  #checkov:skip=CKV_AWS_111:Deployer role requires write access for infrastructure deployment
  #checkov:skip=CKV_AWS_110:Deployer role requires IAM permissions for creating service roles
  #checkov:skip=CKV_AWS_108:Deployer role requires S3/ECR access for artifact management
  #checkov:skip=CKV_AWS_109:Deployer role requires IAM management permissions for infrastructure
  #checkov:skip=CKV_AWS_107:Deployer role requires ECR credentials for image management
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
      "codeartifact:*",
      "sts:GetServiceBearerToken",
    ]
    resources = ["*"]
  }
}

#Attaches the infrastructure deployment policy to the deployer role
resource "aws_iam_role_policy" "deployer_infrastructure" {
  name   = "${local.deployer_role_name}-infrastructure"
  role   = aws_iam_role.deployer.id
  policy = data.aws_iam_policy_document.deployer_infrastructure.json
}

#Attaches any additional managed IAM policies to the deployer role
resource "aws_iam_role_policy_attachment" "additional_policies" {
  count = length(var.additional_policy_arns)

  role       = aws_iam_role.deployer.name
  policy_arn = var.additional_policy_arns[count.index]
}
