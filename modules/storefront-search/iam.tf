#Lambda execution role — VPC ENI mgmt + SSM read for the HMAC secret +
#CloudWatch logs + X-Ray. No outbound AWS perms otherwise.

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "search_gateway" {
  name                 = "${local.name_prefix}-search-gateway"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  tags                 = var.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.search_gateway.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  role       = aws_iam_role.search_gateway.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_xray" {
  role       = aws_iam_role.search_gateway.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

data "aws_iam_policy_document" "ssm_read" {
  count = var.hmac_secret_parameter_name != "" ? 1 : 0
  statement {
    effect    = "Allow"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:*:parameter${startswith(var.hmac_secret_parameter_name, "/") ? "" : "/"}${var.hmac_secret_parameter_name}"]
  }
  statement {
    effect    = "Allow"
    actions   = ["kms:Decrypt"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["ssm.${var.region}.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "ssm_read" {
  count  = var.hmac_secret_parameter_name != "" ? 1 : 0
  name   = "${local.name_prefix}-search-gateway-ssm"
  role   = aws_iam_role.search_gateway.id
  policy = data.aws_iam_policy_document.ssm_read[0].json
}
