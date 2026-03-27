# Auto-Remediation Lambda
#
# Subscribes to the cloudops-security-alerts SNS topic with a HIGH/CRITICAL
# filter policy. When a new finding arrives it either:
#   1. Auto-remediates safe, well-understood issues (S3 public access, SG open
#      ports, RDS deletion protection in prod).
#   2. Creates a GitHub issue for findings that require human review (wildcard
#      IAM policies, RDS public access, EKS public endpoint, unused roles).
#   3. Quarantines pods and creates a GitHub issue for Falco CRITICAL findings.
#
# NOTE: SNS → Lambda uses aws_sns_topic_subscription (protocol = "lambda")
# not aws_lambda_event_source_mapping, which is for poll-based sources (SQS,
# Kinesis, DynamoDB Streams). SNS uses a push model; the permission below
# allows SNS to invoke the function on each delivery.
#
# IMPORTANT — install Lambda dependencies before terraform apply:
#   cd modules/security/lambda_function/auto_remediation && npm install --omit=dev && cd -

resource "null_resource" "auto_remediation_build" {
  triggers = {
    package_hash = filemd5("${path.module}/lambda_function/auto_remediation/package.json")
    source_hash  = filemd5("${path.module}/lambda_function/auto_remediation/index.js")
  }

  provisioner "local-exec" {
    command     = "npm install --omit=dev --prefix ${path.module}/lambda_function/auto_remediation ${path.module}/lambda_function/auto_remediation"
    working_dir = path.module
  }
}

data "archive_file" "auto_remediation" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function/auto_remediation"
  output_path = "${path.module}/lambda_function/auto_remediation.zip"

  depends_on = [null_resource.auto_remediation_build]
}

resource "aws_cloudwatch_log_group" "auto_remediation" {
  name              = "/aws/lambda/${var.project_name}-auto-remediation"
  retention_in_days = 30

  tags = var.tags
}

resource "aws_lambda_function" "auto_remediation" {
  function_name = "${var.project_name}-auto-remediation"
  description   = "Auto-remediates safe security findings and creates GitHub issues for the rest"

  filename         = data.archive_file.auto_remediation.output_path
  source_code_hash = data.archive_file.auto_remediation.output_base64sha256
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  role             = aws_iam_role.auto_remediation.arn

  timeout     = 120
  memory_size = 256

  environment {
    variables = {
      FINDINGS_TABLE           = aws_dynamodb_table.security_findings.name
      GITHUB_TOKEN_SECRET_ARN  = var.github_token_secret_arn
      GITHUB_REPO              = var.github_repo
      EKS_CLUSTER_NAME         = var.eks_cluster_name
      ENVIRONMENT              = var.environment
      DRY_RUN                  = "false"
      AWS_NODEJS_CONNECTION_REUSE_ENABLED = "1"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.auto_remediation_basic_execution,
    aws_cloudwatch_log_group.auto_remediation,
    data.archive_file.auto_remediation,
  ]

  tags = merge(var.tags, { Name = "${var.project_name}-auto-remediation" })
}

# Allow SNS to invoke this Lambda
resource "aws_lambda_permission" "auto_remediation_sns" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.auto_remediation.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.security_alerts.arn
}

# Subscribe to the security-alerts topic; deliver only HIGH and CRITICAL findings.
# SNS evaluates filter_policy against the MessageAttributes set by the compliance scanner.
resource "aws_sns_topic_subscription" "auto_remediation" {
  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.auto_remediation.arn

  filter_policy = jsonencode({
    severity = ["HIGH", "CRITICAL"]
  })

  depends_on = [aws_lambda_permission.auto_remediation_sns]
}

# ── IAM ───────────────────────────────────────────────────────────────────────

data "aws_iam_policy_document" "auto_remediation_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "auto_remediation" {
  name               = "${var.project_name}-auto-remediation"
  assume_role_policy = data.aws_iam_policy_document.auto_remediation_assume_role.json
  description        = "Execution role for the ${var.project_name} auto-remediation Lambda"

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "auto_remediation_basic_execution" {
  role       = aws_iam_role.auto_remediation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "auto_remediation_permissions" {
  # S3 — remediate public access, encryption, versioning (no data plane access)
  statement {
    sid    = "S3Remediation"
    effect = "Allow"
    actions = [
      "s3:PutBucketPublicAccessBlock",
      "s3:PutEncryptionConfiguration",
      "s3:PutBucketVersioning",
    ]
    resources = ["*"]
  }

  # EC2 — revoke overly-permissive security group ingress rules
  statement {
    sid    = "EC2SGRemediation"
    effect = "Allow"
    actions = [
      "ec2:RevokeSecurityGroupIngress",
      "ec2:DescribeSecurityGroups",
    ]
    resources = ["*"]
  }

  # RDS — enable deletion protection and bump backup retention (no data access)
  statement {
    sid    = "RDSRemediation"
    effect = "Allow"
    actions = [
      "rds:ModifyDBInstance",
    ]
    resources = ["*"]
  }

  # EKS — describe cluster to get endpoint + CA cert for K8s API calls
  statement {
    sid    = "EKSDescribe"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
    ]
    resources = ["*"]
  }

  # STS — GetCallerIdentity is used when generating the presigned EKS bearer token
  statement {
    sid    = "STSGetCallerIdentity"
    effect = "Allow"
    actions = [
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  # Secrets Manager — read only the GitHub token secret
  statement {
    sid    = "SecretsManagerGitHubToken"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = [
      var.github_token_secret_arn != "" ? var.github_token_secret_arn : "arn:aws:secretsmanager:*:*:secret:NONE",
    ]
  }

  # DynamoDB — look up and update findings in the security table
  statement {
    sid    = "DynamoDBFindings"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.security_findings.arn,
      "${aws_dynamodb_table.security_findings.arn}/index/*",
    ]
  }

  # CloudWatch — publish remediation metrics
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

  # SNS — publish remediation notifications back to the alerts topic
  statement {
    sid    = "SNSPublish"
    effect = "Allow"
    actions = [
      "sns:Publish",
    ]
    resources = [aws_sns_topic.security_alerts.arn]
  }
}

resource "aws_iam_role_policy" "auto_remediation_permissions" {
  name   = "${var.project_name}-auto-remediation-permissions"
  role   = aws_iam_role.auto_remediation.id
  policy = data.aws_iam_policy_document.auto_remediation_permissions.json
}
