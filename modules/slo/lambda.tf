# Error budget tracker Lambda — queries Prometheus SLO recording rules every 5 minutes,
# calculates error budgets and burn rates, and publishes to CloudWatch + DynamoDB.
#
# IMPORTANT — before running `terraform apply`, install Lambda dependencies:
#   cd modules/slo/lambda_function && npm install --omit=dev && cd -
# The node_modules directory must be present for the archive_file zip to include them.
# AWS SDK v3 is NOT bundled with the Node.js 20.x Lambda runtime.
#
# NOTE — Prometheus connectivity:
# The default Prometheus URL is cluster-internal (only reachable from within the EKS VPC).
# To use this Lambda without VPC configuration, set prometheus_url to the Grafana datasource
# proxy endpoint: https://grafana.<domain>/api/datasources/proxy/uid/prometheus
# and supply grafana_api_key_secret_arn so the Lambda can authenticate.

# Install production dependencies then zip the function directory.
# Triggers re-install + re-zip when package.json or source changes.
resource "null_resource" "lambda_build" {
  triggers = {
    package_hash = filemd5("${path.module}/lambda_function/package.json")
    source_hash  = filemd5("${path.module}/lambda_function/index.js")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev --prefix ${path.module}/lambda_function ${path.module}/lambda_function"
    working_dir = path.module
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function"
  output_path = "${path.module}/lambda_function.zip"

  depends_on = [null_resource.lambda_build]
}

# CloudWatch log group — created explicitly so we control retention
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project_name}-error-budget-tracker"
  retention_in_days = 14

  tags = var.tags
}

resource "aws_lambda_function" "error_budget_tracker" {
  function_name = "${var.project_name}-error-budget-tracker"
  description   = "Queries Prometheus SLO recording rules and tracks error budgets for order-api"

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  role             = aws_iam_role.lambda.arn

  timeout     = 60
  memory_size = 256

  environment {
    variables = {
      PROMETHEUS_URL                      = var.prometheus_url
      GRAFANA_URL                         = var.grafana_url
      GRAFANA_API_KEY_SECRET_ARN          = var.grafana_api_key_secret_arn
      SLO_AVAILABILITY_TARGET             = "0.999"
      SLO_LATENCY_TARGET                  = "0.95"
      DYNAMODB_TABLE                      = aws_dynamodb_table.error_budgets.name
      ENVIRONMENT                         = var.environment
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda,
    data.archive_file.lambda,
  ]

  tags = merge(var.tags, { Name = "${var.project_name}-error-budget-tracker" })
}

# EventBridge rule — fires every 5 minutes
resource "aws_cloudwatch_event_rule" "every_five_minutes" {
  name                = "${var.project_name}-slo-tracker-schedule"
  description         = "Triggers the SLO error-budget tracker Lambda every 5 minutes"
  schedule_expression = "rate(5 minutes)"

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "lambda" {
  rule      = aws_cloudwatch_event_rule.every_five_minutes.name
  target_id = "ErrorBudgetTrackerLambda"
  arn       = aws_lambda_function.error_budget_tracker.arn
}

# Allow EventBridge to invoke the Lambda
resource "aws_lambda_permission" "eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.error_budget_tracker.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.every_five_minutes.arn
}
