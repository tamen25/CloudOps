#This file defines github OIDC settings for CloudOps.
#GitHub Actions OIDC provider — allows GitHub to federate identities into AWS
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = merge(local.common_tags, { Name = "github-actions-oidc" })
}

#Trust policy: deploy role only for protected branch or GitHub environments.
data "aws_iam_policy_document" "github_actions_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    #Audience must be sts.amazonaws.com when using aws-actions/configure-aws-credentials
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    #Scope to this repo only. PR/feature refs cannot assume the deploy role;
    #environment-bound jobs use GitHub's environment subject claim.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repo}:ref:refs/heads/main",
        "repo:${var.github_repo}:environment:dev",
        "repo:${var.github_repo}:environment:staging",
        "repo:${var.github_repo}:environment:production",
      ]
    }
  }
}

#Creates the AWS IAM role resource named github actions.
resource "aws_iam_role" "github_actions" {
  name               = "${var.project_name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  description        = "${var.project_name} GitHub Actions OIDC role"

  tags = merge(local.common_tags, { Name = "${var.project_name}-github-actions" })
}

#Inline policy: ECR push, EKS read, S3 state access, KMS state key
data "aws_iam_policy_document" "github_actions_permissions" {
  #checkov:skip=CKV_AWS_356:GitHub Actions deployment role requires broad ECR/EKS access
  #checkov:skip=CKV_AWS_111:GitHub Actions deployment role requires write access for infrastructure deployment
  #GetAuthorizationToken is account-level and always requires resource *
  statement {
    sid       = "ECRAuth"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "ECRPush"
    effect = "Allow"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "CodeArtifactPublish"
    effect = "Allow"
    actions = [
      "codeartifact:DescribeDomain",
      "codeartifact:DescribeRepository",
      "codeartifact:GetAuthorizationToken",
      "codeartifact:GetRepositoryEndpoint",
      "codeartifact:ListPackageVersions",
      "codeartifact:PublishPackageVersion",
      "codeartifact:PutPackageMetadata",
      "codeartifact:ReadFromRepository",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "CodeArtifactServiceBearerToken"
    effect    = "Allow"
    actions   = ["sts:GetServiceBearerToken"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "sts:AWSServiceName"
      values   = ["codeartifact.amazonaws.com"]
    }
  }

  statement {
    sid    = "EKSRead"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
      "eks:ListClusters",
    ]
    resources = ["*"]
  }

  #Full access scoped to the Terraform state bucket only
  statement {
    sid    = "StateS3"
    effect = "Allow"
    actions = [
      "s3:ListBucket",
      "s3:GetBucketVersioning",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      data.aws_s3_bucket.terraform_state.arn,
      "${data.aws_s3_bucket.terraform_state.arn}/*",
    ]
  }

  dynamic "statement" {
    for_each = var.create_kms ? [1] : []
    content {
      sid    = "StateKMS"
      effect = "Allow"
      actions = [
        "kms:Decrypt",
        "kms:GenerateDataKey",
      ]
      resources = [aws_kms_key.terraform_state[0].arn]
    }
  }
}

#Creates the AWS IAM role policy resource named github actions permissions.
resource "aws_iam_role_policy" "github_actions_permissions" {
  name   = "${var.project_name}-github-actions-permissions"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.github_actions_permissions.json
}

#Attach the deployer infrastructure policy by reference — shares the same document
#defined in iam.tf so the two roles stay in sync without duplicating policy content
resource "aws_iam_role_policy" "github_actions_infrastructure" {
  name   = "${var.project_name}-github-actions-infrastructure"
  role   = aws_iam_role.github_actions.id
  policy = data.aws_iam_policy_document.deployer_infrastructure.json
}
