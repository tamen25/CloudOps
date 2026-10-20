#FinOps Module — IAM role for cost ingestion Lambda

data "aws_iam_policy_document" "cost_ingestion_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "cost_ingestion" {
  name                 = "${var.project_name}-cost-ingestion-role"
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy   = data.aws_iam_policy_document.cost_ingestion_assume.json
  tags                 = var.tags
}

data "aws_iam_policy_document" "cost_ingestion" {
  #checkov:skip=CKV_AWS_356:FinOps Lambda requires Cost Explorer access - no resource-level restrictions available
  #CloudWatch Logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:log-group:/aws/lambda/${var.project_name}-cost-ingestion:*"]
  }

  #CloudWatch metrics
  statement {
    sid       = "CloudWatchMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudOps/FinOps"]
    }
  }

  #DynamoDB — cost history table only
  statement {
    sid    = "DynamoDB"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.cost_data.arn,
      "${aws_dynamodb_table.cost_data.arn}/index/*",
    ]
  }

  #SNS — cost alerts topic only
  statement {
    sid       = "SNSPublish"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.cost_alerts.arn]
  }

  #Cost Explorer — no resource-level permissions supported
  statement {
    sid    = "CostExplorer"
    effect = "Allow"
    actions = [
      "ce:GetCostAndUsage",
      "ce:GetCostForecast",
      "ce:GetDimensionValues",
      "ce:CreateAnomalyMonitor",
      "ce:GetAnomalies",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "cost_ingestion" {
  name   = "${var.project_name}-cost-ingestion-policy"
  role   = aws_iam_role.cost_ingestion.id
  policy = data.aws_iam_policy_document.cost_ingestion.json
}
