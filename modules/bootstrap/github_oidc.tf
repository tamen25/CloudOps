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

resource "aws_iam_role" "github_actions" {
  name               = "${var.project_name}-github-actions"
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role.json
  description        = "${var.project_name} GitHub Actions OIDC role"

  tags = merge(local.common_tags, { Name = "${var.project_name}-github-actions" })
}

# The CI role's own inline policy: Terraform state access. Everything it
# deploys comes from the deployer policy attached below
# (github_actions_infrastructure), shared with the human deployer role.
data "aws_iam_policy_document" "github_actions_permissions" {
  #Full access scoped to the Terraform state bucket only
  #tfsec:ignore:aws-iam-no-policy-wildcards The state files are objects in this one bucket.
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
