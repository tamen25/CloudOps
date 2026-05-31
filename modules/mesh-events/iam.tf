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

#─── enrichment role: read Kinesis, put to EventBridge, write DLQ + logs ───────
resource "aws_iam_role" "enrichment" {
  name               = "${local.name_prefix}-enrichment"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "enrichment" {
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }

  dynamic "statement" {
    for_each = var.kinesis_stream_arn == "" ? [] : [1]
    content {
      sid    = "KinesisRead"
      effect = "Allow"
      actions = [
        "kinesis:GetRecords",
        "kinesis:GetShardIterator",
        "kinesis:DescribeStream",
        "kinesis:ListShards",
      ]
      resources = [var.kinesis_stream_arn]
    }
  }

  statement {
    sid       = "EventBridgePut"
    effect    = "Allow"
    actions   = ["events:PutEvents"]
    resources = [aws_cloudwatch_event_bus.mesh.arn]
  }

  statement {
    sid       = "DlqWrite"
    effect    = "Allow"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.enrichment_dlq.arn]
  }
}

resource "aws_iam_role_policy" "enrichment" {
  name   = "enrichment"
  role   = aws_iam_role.enrichment.id
  policy = data.aws_iam_policy_document.enrichment.json
}

#─── analytics role: logs only (EMF writes to its own log group) ──────────────
resource "aws_iam_role" "analytics" {
  name               = "${local.name_prefix}-analytics"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = var.tags
}

data "aws_iam_policy_document" "analytics" {
  statement {
    sid       = "Logs"
    effect    = "Allow"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "analytics" {
  name   = "analytics"
  role   = aws_iam_role.analytics.id
  policy = data.aws_iam_policy_document.analytics.json
}
