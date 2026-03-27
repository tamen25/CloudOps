# FinOps Module — Lambda (Cost Ingestion)

data "archive_file" "cost_ingestion" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/cost_ingestion"
  output_path = "${path.module}/lambda_function/cost_ingestion.zip"
}

resource "aws_lambda_function" "cost_ingestion" {
  function_name = "${var.project_name}-cost-ingestion"
  description   = "Ingests AWS Cost Explorer data daily, detects anomalies, publishes metrics, and alerts on cost spikes"

  filename         = data.archive_file.cost_ingestion.output_path
  source_code_hash = data.archive_file.cost_ingestion.output_base64sha256

  role    = aws_iam_role.cost_ingestion.arn
  handler = "index.handler"
  runtime = "nodejs20.x"
  timeout = 300
  memory_size = 512

  environment {
    variables = {
      ENVIRONMENT                       = var.environment
      PROJECT_NAME                      = var.project_name
      DYNAMODB_TABLE                    = aws_dynamodb_table.cost_history.name
      SNS_TOPIC_ARN                     = aws_sns_topic.cost_alerts.arn
      COST_ANOMALY_THRESHOLD_PERCENT    = tostring(var.cost_anomaly_threshold_percent)
      COST_ANOMALY_THRESHOLD_ABSOLUTE   = tostring(var.cost_anomaly_threshold_absolute)
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "cost_ingestion" {
  name              = "/aws/lambda/${aws_lambda_function.cost_ingestion.function_name}"
  retention_in_days = 30
  tags              = var.tags
}

# ── EventBridge daily trigger — 6:00 AM UTC ──────────────────────────────────

resource "aws_cloudwatch_event_rule" "cost_ingestion_schedule" {
  name                = "${var.project_name}-cost-ingestion-schedule"
  description         = "Triggers cost ingestion Lambda daily at 06:00 UTC"
  schedule_expression = "cron(0 6 * * ? *)"
  tags                = var.tags
}

resource "aws_cloudwatch_event_target" "cost_ingestion" {
  rule      = aws_cloudwatch_event_rule.cost_ingestion_schedule.name
  target_id = "CostIngestionLambda"
  arn       = aws_lambda_function.cost_ingestion.arn
}

resource "aws_lambda_permission" "cost_ingestion_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.cost_ingestion.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.cost_ingestion_schedule.arn
}
