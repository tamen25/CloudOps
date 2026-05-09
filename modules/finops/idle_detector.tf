#This file defines idle detector settings for CloudOps.
#FinOps Module — Idle Resource Detector Lambda
#
#Runs every 6 hours and checks:
#1. EKS node utilization (Container Insights — cluster-aggregate CPU + memory)
#2. RDS utilization (CPU + connection count)
#3. EKS pod rightsizing (pod_cpu_utilization < 20% of limit in cloudops ns)
#
#Stores findings in the shared cloudops-cost-data DynamoDB table under
#service=idle-detection / date=YYYY-MM-DD and alerts via SNS when estimated
#wasted cost exceeds $5/day.
#
#Install Lambda dependencies BEFORE terraform apply via:
#./scripts/build-lambdas.sh
#Closes backlog #20.

data "archive_file" "idle_detector" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/idle_detector"
  output_path = "${path.module}/lambda_function/idle_detector.zip"
}

#Creates the AWS lambda function resource named idle detector.
resource "aws_lambda_function" "idle_detector" {
  #checkov:skip=CKV_AWS_117:Lambda intentionally runs outside VPC - calls global AWS APIs (Cost Explorer, EKS, CloudWatch)
  #checkov:skip=CKV_AWS_173:No sensitive data in environment variables - values are resource names and ARNs only
  #checkov:skip=CKV_AWS_272:Code signing not implemented - out of scope for this project
  #checkov:skip=CKV_AWS_116:DLQ not implemented - Lambda errors are surfaced via CloudWatch alarms
  function_name = "${var.project_name}-idle-detector"
  description   = "Detects idle/over-provisioned EKS nodes, RDS instances, and pods; alerts on estimated waste"

  filename         = data.archive_file.idle_detector.output_path
  source_code_hash = data.archive_file.idle_detector.output_base64sha256

  role        = aws_iam_role.idle_detector.arn
  handler     = "index.handler"
  runtime     = "nodejs22.x"
  timeout     = 120
  memory_size = 256

  reserved_concurrent_executions = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ENVIRONMENT                         = var.environment
      EKS_CLUSTER_NAME                    = var.eks_cluster_name
      RDS_INSTANCE_ID                     = var.rds_instance_id
      DYNAMODB_TABLE                      = aws_dynamodb_table.cost_data.name
      SNS_TOPIC_ARN                       = aws_sns_topic.cost_alerts.arn
      IDLE_CPU_THRESHOLD                  = tostring(var.idle_cpu_threshold)
      IDLE_REQUEST_THRESHOLD              = tostring(var.idle_request_threshold)
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambda_function/idle_detector/node_modules/.package-lock.json")
      error_message = "modules/finops/lambda_function/idle_detector/node_modules is missing — run ./scripts/build-lambdas.sh before terraform apply."
    }
  }

  tags = var.tags
}

#Creates the AWS cloudwatch log group resource named idle detector.
resource "aws_cloudwatch_log_group" "idle_detector" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${aws_lambda_function.idle_detector.function_name}"
  retention_in_days = 365
  tags              = var.tags
}

#── EventBridge trigger — every 6 hours ──────────────────────────────────────

resource "aws_cloudwatch_event_rule" "idle_detector_schedule" {
  name                = "${var.project_name}-idle-detector-schedule"
  description         = "Triggers idle resource detector Lambda every 6 hours"
  schedule_expression = "rate(6 hours)"
  tags                = var.tags
}

#Creates the AWS cloudwatch event target resource named idle detector.
resource "aws_cloudwatch_event_target" "idle_detector" {
  rule      = aws_cloudwatch_event_rule.idle_detector_schedule.name
  target_id = "IdleDetectorLambda"
  arn       = aws_lambda_function.idle_detector.arn
}

#Creates the AWS lambda permission resource named idle detector eventbridge.
resource "aws_lambda_permission" "idle_detector_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.idle_detector.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.idle_detector_schedule.arn
}

#── IAM role ──────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "idle_detector_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

#Creates the AWS IAM role resource named idle detector.
resource "aws_iam_role" "idle_detector" {
  name               = "${var.project_name}-idle-detector-role"
  assume_role_policy = data.aws_iam_policy_document.idle_detector_assume.json
  tags               = var.tags
}

#Reads the AWS IAM policy document data source named idle detector.
data "aws_iam_policy_document" "idle_detector" {
  #checkov:skip=CKV_AWS_356:Idle detector requires read access across EC2/EKS/RDS services
  #CloudWatch Logs
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:log-group:/aws/lambda/${var.project_name}-idle-detector:*"]
  }

  #CloudWatch metrics (read + write)
  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:GetMetricData",
      "cloudwatch:ListMetrics",
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
  }

  #RDS — describe instance for class + cost lookup
  statement {
    sid       = "RDSDescribe"
    effect    = "Allow"
    actions   = ["rds:DescribeDBInstances"]
    resources = ["*"]
  }

  #EKS — describe cluster + nodegroups for node count + instance type
  statement {
    sid    = "EKSDescribe"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
      "eks:ListNodegroups",
      "eks:DescribeNodegroup",
    ]
    resources = ["*"]
  }

  #DynamoDB — cost history table
  statement {
    sid    = "DynamoDB"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:GetItem",
    ]
    resources = [
      aws_dynamodb_table.cost_data.arn,
      "${aws_dynamodb_table.cost_data.arn}/index/*",
    ]
  }

  #SNS — cost alerts topic
  statement {
    sid       = "SNSPublish"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.cost_alerts.arn]
  }
}

#Creates the AWS IAM role policy resource named idle detector.
resource "aws_iam_role_policy" "idle_detector" {
  name   = "${var.project_name}-idle-detector-policy"
  role   = aws_iam_role.idle_detector.id
  policy = data.aws_iam_policy_document.idle_detector.json
}
