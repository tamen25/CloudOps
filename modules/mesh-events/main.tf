#Mesh async fan-out: order events on Kinesis → enrichment-lambda → EventBridge
#bus → analytics-lambda. Adds the serverless half of the trace map. A DLQ
#captures enrichment failures.

locals {
  name_prefix = "${var.project_name}-${var.environment}-mesh"
}

data "aws_region" "current" {}

#─── EventBridge bus ──────────────────────────────────────────────────────────
resource "aws_cloudwatch_event_bus" "mesh" {
  name = "${local.name_prefix}-events"
  tags = var.tags
}

#─── DLQ for enrichment failures ──────────────────────────────────────────────
resource "aws_sqs_queue" "enrichment_dlq" {
  name                      = "${local.name_prefix}-enrichment-dlq"
  message_retention_seconds = 1209600 # 14 days
  sqs_managed_sse_enabled   = true
  tags                      = var.tags
}

#─── enrichment-lambda (Kinesis → EventBridge) ────────────────────────────────
data "archive_file" "enrichment" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/enrichment"
  output_path = "${path.module}/.build/enrichment.zip"
  excludes    = ["node_modules/.package-lock.json", "index.test.mjs"]
}

resource "aws_lambda_function" "enrichment" {
  function_name    = "${local.name_prefix}-enrichment"
  role             = aws_iam_role.enrichment.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  filename         = data.archive_file.enrichment.output_path
  source_code_hash = data.archive_file.enrichment.output_base64sha256
  timeout          = 30
  memory_size      = 256

  environment {
    variables = {
      EVENT_BUS_NAME = aws_cloudwatch_event_bus.mesh.name
    }
  }

  dead_letter_config {
    target_arn = aws_sqs_queue.enrichment_dlq.arn
  }

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambdas/enrichment/package.json")
      error_message = "enrichment Lambda deps missing. Run scripts/build-lambdas.sh."
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "enrichment" {
  name              = "/aws/lambda/${aws_lambda_function.enrichment.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_lambda_event_source_mapping" "enrichment_kinesis" {
  count             = var.kinesis_stream_arn == "" ? 0 : 1
  event_source_arn  = var.kinesis_stream_arn
  function_name     = aws_lambda_function.enrichment.function_name
  starting_position = "LATEST"
  batch_size        = 100

  # Send poison batches to the DLQ instead of blocking the shard forever.
  bisect_batch_on_function_error = true
  maximum_retry_attempts         = 3

  destination_config {
    on_failure {
      destination_arn = aws_sqs_queue.enrichment_dlq.arn
    }
  }
}

#─── analytics-lambda (EventBridge → EMF metrics) ─────────────────────────────
data "archive_file" "analytics" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/analytics"
  output_path = "${path.module}/.build/analytics.zip"
  excludes    = ["index.test.mjs"]
}

resource "aws_lambda_function" "analytics" {
  function_name    = "${local.name_prefix}-analytics"
  role             = aws_iam_role.analytics.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  filename         = data.archive_file.analytics.output_path
  source_code_hash = data.archive_file.analytics.output_base64sha256
  timeout          = 15
  memory_size      = 128

  environment {
    variables = {
      METRIC_NAMESPACE = var.metric_namespace
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "analytics" {
  name              = "/aws/lambda/${aws_lambda_function.analytics.function_name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

#Route every enriched order event on the bus to the analytics Lambda.
resource "aws_cloudwatch_event_rule" "order_enriched" {
  name           = "${local.name_prefix}-order-enriched"
  event_bus_name = aws_cloudwatch_event_bus.mesh.name
  description    = "Route enriched order events to analytics."

  event_pattern = jsonencode({
    source = ["cloudops.mesh.enrichment"]
  })

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "analytics" {
  rule           = aws_cloudwatch_event_rule.order_enriched.name
  event_bus_name = aws_cloudwatch_event_bus.mesh.name
  target_id      = "analytics"
  arn            = aws_lambda_function.analytics.arn
}

resource "aws_lambda_permission" "analytics_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.analytics.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.order_enriched.arn
}
