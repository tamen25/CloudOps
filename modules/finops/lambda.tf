# FinOps Module — Cost Ingestion Lambda
#
# Queries AWS Cost Explorer daily at 06:00 UTC, stores per-service costs in
# DynamoDB, detects anomalies (service-level spike + AWS CE native anomalies),
# publishes CloudWatch metrics to CloudOps/FinOps, and alerts via SNS when
# costs spike or the projected monthly spend exceeds the configured budget.
#
# IMPORTANT — install Lambda dependencies before terraform apply:
#   cd modules/finops/lambda_function/cost_ingestion && npm install --omit=dev && cd -

resource "null_resource" "cost_ingestion_build" {
  triggers = {
    package_json = filemd5("${path.module}/lambda_function/cost_ingestion/package.json")
    index_js     = filemd5("${path.module}/lambda_function/cost_ingestion/index.js")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev"
    working_dir = "${path.module}/lambda_function/cost_ingestion"
  }
}

data "archive_file" "cost_ingestion" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/cost_ingestion"
  output_path = "${path.module}/lambda_function/cost_ingestion.zip"

  depends_on = [null_resource.cost_ingestion_build]
}

resource "aws_lambda_function" "cost_ingestion" {
  #checkov:skip=CKV_AWS_117:Lambda intentionally runs outside VPC - calls global AWS APIs (Cost Explorer, EKS, CloudWatch)
  #checkov:skip=CKV_AWS_173:No sensitive data in environment variables - values are resource names and ARNs only
  #checkov:skip=CKV_AWS_272:Code signing not implemented - out of scope for this project
  #checkov:skip=CKV_AWS_116:DLQ not implemented - Lambda errors are surfaced via CloudWatch alarms
  function_name = "${var.project_name}-cost-ingestion"
  description   = "Ingests AWS Cost Explorer data daily, detects anomalies, publishes metrics, and alerts on cost spikes"

  filename         = data.archive_file.cost_ingestion.output_path
  source_code_hash = data.archive_file.cost_ingestion.output_base64sha256

  role        = aws_iam_role.cost_ingestion.arn
  handler     = "index.handler"
  runtime     = "nodejs20.x"
  timeout     = 300
  memory_size = 512

  reserved_concurrent_executions = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ENVIRONMENT                         = var.environment
      PROJECT_NAME                        = var.project_name
      DYNAMODB_TABLE                      = aws_dynamodb_table.cost_data.name
      SNS_TOPIC_ARN                       = aws_sns_topic.cost_alerts.arn
      COST_ANOMALY_THRESHOLD_PERCENT      = tostring(var.cost_anomaly_threshold_percent)
      COST_BUDGET_MONTHLY_USD             = tostring(var.cost_budget_monthly_usd)
      AWS_ACCOUNT_ID                      = var.aws_account_id
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "cost_ingestion" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${aws_lambda_function.cost_ingestion.function_name}"
  retention_in_days = 365
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
