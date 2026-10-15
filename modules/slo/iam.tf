#IAM execution role for the error-budget-tracker Lambda

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project_name}-error-budget-tracker"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  description        = "Execution role for the ${var.project_name} SLO error-budget tracker Lambda"

  tags = var.tags
}

#Basic execution — CloudWatch Logs (log group + log stream + put events)
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "lambda_permissions" {
  #CloudWatch — publish SLO metrics to the CloudOps/SLO namespace
  statement {
    sid    = "CloudWatchPutMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudOps/SLO"]
    }
  }

  #DynamoDB — read and write to the error-budgets table only
  statement {
    sid    = "DynamoDBErrorBudgets"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.error_budgets.arn,
      "${aws_dynamodb_table.error_budgets.arn}/index/*",
    ]
  }

  #Secrets Manager — retrieve the Grafana API key
  statement {
    sid    = "SecretsManagerGrafanaKey"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    #Scope to the specific secret ARN when provided; fallback to no-op wildcard
    resources = [
      var.grafana_api_key_secret_arn != "" ? var.grafana_api_key_secret_arn : "arn:aws:secretsmanager:*:*:secret:NONE",
    ]
  }
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name   = "${var.project_name}-error-budget-tracker-permissions"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}
