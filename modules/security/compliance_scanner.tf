#Compliance Scanner Lambda
#
#Runs every 6 hours via EventBridge. Scans S3, RDS, EKS, security groups, IAM,
#and Secrets Manager against a security baseline. Findings are deduplicated in
#DynamoDB, new HIGH/CRITICAL findings trigger SNS, and metrics are published to
#CloudWatch under the CloudOps/Security namespace.
#
#Install Lambda dependencies BEFORE terraform apply via:
#./scripts/build-lambdas.sh
#Closes backlog #20.

data "archive_file" "compliance_scanner" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/compliance_scanner"
  output_path = "${path.module}/lambda_function/compliance_scanner.zip"
}

resource "aws_cloudwatch_log_group" "compliance_scanner" {
  #checkov:skip=CKV_AWS_158:AWS managed encryption is acceptable - KMS CMK adds cost for log data
  name              = "/aws/lambda/${var.project_name}-compliance-scanner"
  retention_in_days = 365

  tags = var.tags
}

resource "aws_lambda_function" "compliance_scanner" {
  #checkov:skip=CKV_AWS_117:Lambda intentionally runs outside VPC - calls global AWS APIs (Cost Explorer, EKS, CloudWatch)
  #checkov:skip=CKV_AWS_173:No sensitive data in environment variables - values are resource names and ARNs only
  #checkov:skip=CKV_AWS_272:Code signing not implemented - out of scope for this project
  #checkov:skip=CKV_AWS_116:DLQ not implemented - Lambda errors are surfaced via CloudWatch alarms
  function_name = "${var.project_name}-compliance-scanner"
  description   = "Scans AWS resources against a security baseline every 6 hours"

  filename         = data.archive_file.compliance_scanner.output_path
  source_code_hash = data.archive_file.compliance_scanner.output_base64sha256
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  role             = aws_iam_role.compliance_scanner.arn

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
      VPC_ID                              = var.vpc_id
      RDS_INSTANCE_ID                     = var.rds_instance_id
      EKS_CLUSTER_NAME                    = var.eks_cluster_name
      STATE_BUCKET_NAME                   = var.state_bucket_name
      LOKI_BUCKET_NAME                    = var.loki_bucket_name
      TEMPO_BUCKET_NAME                   = var.tempo_bucket_name
      FINDINGS_TABLE                      = aws_dynamodb_table.security_findings.name
      SNS_TOPIC_ARN                       = aws_sns_topic.security_alerts.arn
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.compliance_scanner_basic_execution,
    aws_cloudwatch_log_group.compliance_scanner,
    data.archive_file.compliance_scanner,
  ]

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambda_function/compliance_scanner/node_modules/.package-lock.json")
      error_message = "modules/security/lambda_function/compliance_scanner/node_modules is missing — run ./scripts/build-lambdas.sh before terraform apply."
    }
  }

  tags = merge(var.tags, { Name = "${var.project_name}-compliance-scanner" })
}

#EventBridge rule — fires every 6 hours
resource "aws_cloudwatch_event_rule" "compliance_scanner" {
  name                = "${var.project_name}-compliance-scanner-schedule"
  description         = "Triggers the compliance scanner Lambda every 6 hours"
  schedule_expression = "rate(6 hours)"

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "compliance_scanner" {
  rule      = aws_cloudwatch_event_rule.compliance_scanner.name
  target_id = "ComplianceScannerLambda"
  arn       = aws_lambda_function.compliance_scanner.arn
}

resource "aws_lambda_permission" "compliance_scanner_eventbridge" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.compliance_scanner.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.compliance_scanner.arn
}

#── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "compliance_scanner_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "compliance_scanner" {
  name               = "${var.project_name}-compliance-scanner"
  assume_role_policy = data.aws_iam_policy_document.compliance_scanner_assume_role.json
  description        = "Execution role for the ${var.project_name} compliance scanner Lambda"

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "compliance_scanner_basic_execution" {
  role       = aws_iam_role.compliance_scanner.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "compliance_scanner_permissions" {
  #checkov:skip=CKV_AWS_356:Compliance scanner requires read access across multiple AWS services
  #EC2 — describe security groups in the project VPC
  statement {
    sid    = "EC2DescribeSecurityGroups"
    effect = "Allow"
    actions = [
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeVpcs",
    ]
    resources = ["*"]
  }

  #RDS — read instance configuration
  statement {
    sid    = "RDSDescribeInstances"
    effect = "Allow"
    actions = [
      "rds:DescribeDBInstances",
    ]
    resources = ["*"]
  }

  #S3 — read bucket security configuration (no data access)
  statement {
    sid    = "S3BucketSecurityConfig"
    effect = "Allow"
    actions = [
      "s3:GetBucketPublicAccessBlock",
      "s3:GetBucketEncryption",
      "s3:GetBucketVersioning",
      "s3:ListAllMyBuckets",
    ]
    resources = ["*"]
  }

  #IAM — read policies, roles, and account summary (read-only)
  statement {
    sid    = "IAMReadOnly"
    effect = "Allow"
    actions = [
      "iam:ListPolicies",
      "iam:GetPolicyVersion",
      "iam:ListRoles",
      "iam:GetRole",
      "iam:GetAccountSummary",
    ]
    resources = ["*"]
  }

  #EKS — describe cluster configuration
  statement {
    sid    = "EKSDescribeCluster"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
    ]
    resources = ["*"]
  }

  #Secrets Manager — list and describe secrets (no GetSecretValue)
  statement {
    sid    = "SecretsManagerListDescribe"
    effect = "Allow"
    actions = [
      "secretsmanager:ListSecrets",
      "secretsmanager:DescribeSecret",
    ]
    resources = ["*"]
  }

  #DynamoDB — read/write findings table and its GSIs
  statement {
    sid    = "DynamoDBFindingsTable"
    effect = "Allow"
    actions = [
      "dynamodb:PutItem",
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:Scan",
    ]
    resources = [
      aws_dynamodb_table.security_findings.arn,
      "${aws_dynamodb_table.security_findings.arn}/index/*",
    ]
  }

  #CloudWatch — publish compliance metrics
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
      values   = ["CloudOps/Security"]
    }
  }

  #SNS — publish finding alerts
  statement {
    sid    = "SNSPublishAlerts"
    effect = "Allow"
    actions = [
      "sns:Publish",
    ]
    resources = [aws_sns_topic.security_alerts.arn]
  }
}

resource "aws_iam_role_policy" "compliance_scanner_permissions" {
  name   = "${var.project_name}-compliance-scanner-permissions"
  role   = aws_iam_role.compliance_scanner.id
  policy = data.aws_iam_policy_document.compliance_scanner_permissions.json
}
