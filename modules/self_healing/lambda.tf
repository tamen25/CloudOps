# Self-Healing Controller — Lambda + EventBridge
#
# Two triggers:
#   1. SNS (cloudops-healing-triggers) — CloudWatch Alarms notify this topic
#      when a threshold is breached; the alarm name drives the routing logic.
#   2. EventBridge rule watching EKS pod failure events from CloudTrail
#      (FailedScheduling, BackOff, OOMKilled) so the controller can react
#      before a CloudWatch Alarm fires.

locals {
  controller_src_dir = "${path.module}/lambda_function"
  controller_zip     = "${path.module}/lambda_function/self_healing_controller.zip"
}

# ── Zip ───────────────────────────────────────────────────────────────────────
# npm install runs in scripts/build-lambdas.sh before terraform apply (closes
# backlog #20). The lifecycle.precondition on aws_lambda_function below fails
# fast with a clear message if the build step was skipped.

data "archive_file" "self_healing" {
  type        = "zip"
  source_dir  = local.controller_src_dir
  output_path = local.controller_zip
  excludes    = ["*.zip"]
}

# ── Lambda ────────────────────────────────────────────────────────────────────

resource "aws_lambda_function" "self_healing_controller" {
  #checkov:skip=CKV_AWS_117:Lambda intentionally runs outside VPC - calls global AWS APIs (Cost Explorer, EKS, CloudWatch)
  #checkov:skip=CKV_AWS_173:No sensitive data in environment variables - values are resource names and ARNs only
  #checkov:skip=CKV_AWS_272:Code signing not implemented - out of scope for this project
  #checkov:skip=CKV_AWS_116:DLQ not implemented - Lambda errors are surfaced via CloudWatch alarms
  function_name    = "${var.project_name}-self-healing-controller"
  role             = aws_iam_role.self_healing.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  timeout          = 120
  memory_size      = 256
  filename         = data.archive_file.self_healing.output_path
  source_code_hash = data.archive_file.self_healing.output_base64sha256

  reserved_concurrent_executions = 10

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ENVIRONMENT             = var.environment
      EKS_CLUSTER_NAME        = var.eks_cluster_name
      RDS_INSTANCE_ID         = var.rds_instance_id
      MIN_HEALTHY_PODS        = tostring(var.min_healthy_pods)
      MAX_SCALE_OUT_PODS      = tostring(var.max_scale_out_pods)
      ROLLBACK_ON_ERROR_RATE  = tostring(var.rollback_on_error_rate)
      SNS_TOPIC_ARN           = aws_sns_topic.healing_triggers.arn
      GITHUB_REPO             = var.github_repo
      GITHUB_TOKEN_SECRET_ARN = var.github_token_secret_arn
      DRY_RUN                 = tostring(var.dry_run)
      APPLICATION_NAMESPACE   = var.application_namespace
      APPLICATION_NAME        = var.application_name
    }
  }

  lifecycle {
    precondition {
      condition     = fileexists("${local.controller_src_dir}/node_modules/.package-lock.json")
      error_message = "modules/self_healing/lambda_function/node_modules is missing — run ./scripts/build-lambdas.sh before terraform apply."
    }
  }

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "self_healing_controller" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${var.project_name}-self-healing-controller"
  retention_in_days = 365
  tags              = var.tags
}

# ── SNS trigger topic ─────────────────────────────────────────────────────────

resource "aws_sns_topic" "healing_triggers" {
  name              = "${var.project_name}-healing-triggers"
  kms_master_key_id = "alias/aws/sns"
  tags              = var.tags
}

resource "aws_sns_topic_policy" "healing_triggers" {
  arn = aws_sns_topic.healing_triggers.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudWatchAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.healing_triggers.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:cloudwatch:${var.region}:${var.aws_account_id}:alarm:*"
          }
        }
      },
    ]
  })
}

resource "aws_lambda_permission" "sns_invoke_self_healing" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.self_healing_controller.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.healing_triggers.arn
}

resource "aws_sns_topic_subscription" "self_healing_lambda" {
  topic_arn = aws_sns_topic.healing_triggers.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.self_healing_controller.arn
}

# ── EventBridge — EKS pod failure events ─────────────────────────────────────
# Watches CloudTrail management events for EKS pod scheduling failures
# and container back-off so the controller can react before a CW alarm fires.

resource "aws_cloudwatch_event_rule" "eks_pod_failures" {
  name        = "${var.project_name}-eks-pod-failures"
  description = "Captures EKS pod failure events (FailedScheduling, BackOff, OOMKilled) for self-healing"

  event_pattern = jsonencode({
    source      = ["aws.eks"]
    detail-type = ["EKS Pod State Change"]
    detail = {
      reason = ["FailedScheduling", "BackOff", "OOMKilled", "CrashLoopBackOff"]
    }
  })

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "eks_pod_failures_to_lambda" {
  rule      = aws_cloudwatch_event_rule.eks_pod_failures.name
  target_id = "SelfHealingController"
  arn       = aws_lambda_function.self_healing_controller.arn
}

resource "aws_lambda_permission" "eventbridge_invoke_self_healing" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.self_healing_controller.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.eks_pod_failures.arn
}
