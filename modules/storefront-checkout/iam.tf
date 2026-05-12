data "aws_iam_policy_document" "sfn_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["states.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "sfn" {
  name               = "${local.name_prefix}-checkout-sfn"
  assume_role_policy = data.aws_iam_policy_document.sfn_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "sfn" {
  statement {
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.email.arn]
  }
  statement {
    effect    = "Allow"
    actions   = ["states:InvokeHTTPEndpoint"]
    resources = [aws_sfn_state_machine.checkout.arn]
  }
  statement {
    effect = "Allow"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "sfn" {
  name   = "${local.name_prefix}-checkout-sfn"
  role   = aws_iam_role.sfn.id
  policy = data.aws_iam_policy_document.sfn.json
}

#─── Email Lambda role ─────────────────────────────────────────────────────
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

resource "aws_iam_role" "email" {
  name               = "${local.name_prefix}-order-email"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "email_basic" {
  role       = aws_iam_role.email.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "email_sqs" {
  role       = aws_iam_role.email.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaSQSQueueExecutionRole"
}

data "aws_iam_policy_document" "email_ses" {
  statement {
    effect    = "Allow"
    actions   = ["ses:SendEmail", "sesv2:SendEmail"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "email_ses" {
  count  = var.ses_source_email != "" ? 1 : 0
  name   = "${local.name_prefix}-order-email-ses"
  role   = aws_iam_role.email.id
  policy = data.aws_iam_policy_document.email_ses.json
}

#─── Storefront IRSA gains states:StartExecution on this state machine ─────
resource "aws_iam_role_policy" "storefront_start" {
  count = var.storefront_irsa_role_name != "" ? 1 : 0
  name  = "${local.name_prefix}-checkout-start"
  role  = var.storefront_irsa_role_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = ["states:StartExecution", "states:DescribeExecution"]
      Resource = [
        aws_sfn_state_machine.checkout.arn,
        "${replace(aws_sfn_state_machine.checkout.arn, "stateMachine", "execution")}:*",
      ]
    }]
  })
}
