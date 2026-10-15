#IRSA role — trusted by the storefront ServiceAccount in the storefront
#namespace. Grants only the Dynamo actions we use on the cart table.

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:sub"
      values   = ["system:serviceaccount:${var.service_account_namespace}:${var.service_account_name}"]
    }
    condition {
      test     = "StringEquals"
      variable = "${replace(var.oidc_provider_url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cart" {
  name                 = "${local.name_prefix}-storefront-cart"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  tags                 = var.tags
}

data "aws_iam_policy_document" "cart" {
  statement {
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:BatchWriteItem",
      "dynamodb:BatchGetItem",
    ]
    resources = [
      aws_dynamodb_table.cart.arn,
    ]
  }
}

resource "aws_iam_role_policy" "cart" {
  name   = "${local.name_prefix}-storefront-cart"
  role   = aws_iam_role.cart.id
  policy = data.aws_iam_policy_document.cart.json
}
