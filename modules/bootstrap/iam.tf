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

  #tfsec:ignore:aws-iam-no-policy-wildcards The state files are objects in this one bucket.
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

# What Terraform needs to deploy the platform. Shared by the human deployer
# role and the GitHub Actions role (github_oidc.tf), so the two cannot drift.
#
# IAM is the one service scoped to names: with iam:* on every resource, the
# role could create or edit any role in the account and grant itself anything
# (admin in effect). Write access is limited to the project's own roles,
# policies and instance profiles (every one is named "<project_name>-…"),
# OIDC providers (EKS and GitHub) and service-linked roles, whose permissions
# AWS defines. Reading IAM stays account-wide: Terraform reads to plan.
# S3 is scoped the same way: every bucket the modules create is named
# "<project_name>-…".
# trivy:ignore:AVD-AWS-0345 s3:* is limited to the project's own buckets (S3ProjectBuckets).
data "aws_iam_policy_document" "deployer_infrastructure" {
  #checkov:skip=CKV_AWS_356:Deployer role requires broad infrastructure permissions for Terraform
  #checkov:skip=CKV_AWS_111:Deployer role requires write access for infrastructure deployment
  #checkov:skip=CKV_AWS_108:Deployer role requires S3/ECR access for artifact management
  #checkov:skip=CKV_AWS_107:Deployer role requires ECR credentials for image management
  #tfsec:ignore:aws-iam-no-policy-wildcards Service-wide actions are what a Terraform deployer creates and destroys; IAM, the escalation path, is scoped below.
  statement {
    sid    = "InfrastructureDeployment"
    effect = "Allow"
    # One entry per AWS service the modules create resources in (derived
    # from their aws_* resource types). A module that adds a service adds it
    # here too, and in scripts/oidc.sh.
    actions = [
      "acm:*",
      "apigateway:*",
      "backup:*",
      "backup-storage:*",
      "budgets:*",
      "cloudformation:*", # the SAR rotation Lambda is a CloudFormation stack
      "cloudtrail:*",
      "cloudwatch:*",
      "codeartifact:*",
      "cognito-idp:*",
      "config:*",
      "dynamodb:*",
      "ec2:*", # VPC, subnets, routes, NAT, security groups, endpoints, launch templates
      "ecr:*",
      "eks:*",
      "elasticloadbalancing:*",
      "events:*",
      "guardduty:*",
      "kinesis:*",
      "kms:*",
      "lambda:*",
      "logs:*",
      "rds:*",
      "route53:*",
      "secretsmanager:*",
      "securityhub:*",
      "serverlessrepo:*",
      "sns:*",
      "sqs:*",
      "ssm:*",
      "states:*",
      "wafv2:*",
      "sts:GetServiceBearerToken",
    ]
    resources = ["*"]
  }

  #tfsec:ignore:aws-iam-no-policy-wildcards Scoped to the project's own buckets and their objects.
  statement {
    sid     = "S3ProjectBuckets"
    effect  = "Allow"
    actions = ["s3:*"]
    resources = [
      "arn:aws:s3:::${var.project_name}-*",
      "arn:aws:s3:::${var.project_name}-*/*",
    ]
  }

  statement {
    sid    = "S3Account"
    effect = "Allow"
    actions = [
      "s3:ListAllMyBuckets",
      "s3:GetAccountPublicAccessBlock",
    ]
    resources = ["*"]
  }

  # The RDS rotation Lambda is a Serverless Application Repository app; its
  # code is read from the repository's change-set bucket on deploy.
  statement {
    sid       = "S3ServerlessRepoChangeSets"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["arn:aws:s3:::awsserverlessrepo-changesets*/*"]
  }

  #tfsec:ignore:aws-iam-no-policy-wildcards Read-only: Terraform reads IAM to plan.
  statement {
    sid       = "IAMRead"
    effect    = "Allow"
    actions   = ["iam:Get*", "iam:List*"]
    resources = ["*"]
  }

  #tfsec:ignore:aws-iam-no-policy-wildcards Scoped to the project's own name prefix: iam:* on roles and policies it creates.
  statement {
    sid     = "IAMProjectResources"
    effect  = "Allow"
    actions = ["iam:*"]
    resources = [
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.project_name}-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:instance-profile/${var.project_name}-*",
      "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/*",
    ]
  }

  statement {
    sid    = "IAMServiceLinkedRoles"
    effect = "Allow"
    actions = [
      "iam:CreateServiceLinkedRole",
      "iam:DeleteServiceLinkedRole",
      "iam:GetServiceLinkedRoleDeletionStatus",
    ]
    resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/aws-service-role/*"]
  }

  # With the permissions boundary on (permissions_boundary.tf), a project
  # role is created, or has a policy put on it, only while it carries the
  # boundary, so no role the deployer makes can do more than the boundary
  # allows.
  dynamic "statement" {
    for_each = var.enable_permissions_boundary ? [1] : []
    content {
      sid    = "ProjectRolesCarryTheBoundary"
      effect = "Deny"
      actions = [
        "iam:CreateRole",
        "iam:PutRolePermissionsBoundary",
        "iam:PutRolePolicy",
        "iam:AttachRolePolicy",
      ]
      resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*"]
      condition {
        test     = "StringNotEquals"
        variable = "iam:PermissionsBoundary"
        values   = [local.permissions_boundary_arn]
      }
    }
  }

  # ...and may never take it off, edit it, or change the two bootstrap
  # roles, its own included. Those are applied by an administrator.
  dynamic "statement" {
    for_each = var.enable_permissions_boundary ? [1] : []
    content {
      sid         = "BoundaryAndBootstrapRolesAreFixed"
      effect      = "Deny"
      not_actions = ["iam:Get*", "iam:List*"]
      resources = [
        local.permissions_boundary_arn,
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${local.deployer_role_name}",
        "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-github-actions",
      ]
    }
  }

  # A project role it makes could trust the deployer; assuming it would give
  # the deployer whatever the role holds (the boundary allows S3 beyond the
  # project's buckets, for the compliance scanner and auto-remediation).
  dynamic "statement" {
    for_each = var.enable_permissions_boundary ? [1] : []
    content {
      sid       = "NoAssumingProjectRoles"
      effect    = "Deny"
      actions   = ["sts:AssumeRole", "sts:TagSession", "sts:SetSourceIdentity"]
      resources = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*"]
    }
  }

  dynamic "statement" {
    for_each = var.enable_permissions_boundary ? [1] : []
    content {
      sid       = "BoundaryStaysOn"
      effect    = "Deny"
      actions   = ["iam:DeleteRolePermissionsBoundary"]
      resources = ["*"]
    }
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
