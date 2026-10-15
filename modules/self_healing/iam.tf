#This file defines IAM settings for CloudOps.
#Self-Healing Controller — IAM
#
#Lambda execution role with least-privilege access to the AWS services
#needed for each healing action (CloudWatch, EKS, Auto Scaling, RDS,
#Secrets Manager, SNS, CloudWatch Logs).

data "aws_iam_policy_document" "self_healing_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

#Creates the AWS IAM role resource named self healing.
resource "aws_iam_role" "self_healing" {
  name               = "${var.project_name}-self-healing-controller"
  assume_role_policy = data.aws_iam_policy_document.self_healing_assume.json
  tags               = var.tags
}

#Reads the AWS IAM policy document data source named self healing.
data "aws_iam_policy_document" "self_healing" {
  #checkov:skip=CKV_AWS_356:Self-healing controller requires broad EKS/EC2/Lambda access for remediation
  #checkov:skip=CKV_AWS_111:Self-healing controller requires write access for scaling and rollback operations
  #── CloudWatch Logs ──────────────────────────────────────────────────────────
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.region}:${var.aws_account_id}:log-group:/aws/lambda/${var.project_name}-self-healing-controller:*"]
  }

  #── CloudWatch Metrics — read alarms + publish healing metrics ───────────────
  statement {
    sid    = "CloudWatchMetrics"
    effect = "Allow"
    actions = [
      "cloudwatch:GetMetricData",
      "cloudwatch:GetMetricStatistics",
      "cloudwatch:ListMetrics",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:PutMetricData",
    ]
    resources = ["*"]
  }

  #── CloudWatch Events — create one-time scale-in rules ────────────────────────
  statement {
    sid    = "CloudWatchEvents"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:PutTargets",
      "events:DeleteRule",
      "events:RemoveTargets",
      "events:DescribeRule",
    ]
    resources = ["arn:aws:events:${var.region}:${var.aws_account_id}:rule/${var.project_name}-scale-in-*"]
  }

  #── EKS — describe cluster for endpoint/CA and manage node groups ─────────────
  statement {
    sid    = "EKS"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
      "eks:ListNodegroups",
      "eks:DescribeNodegroup",
      "eks:UpdateNodegroupConfig",
    ]
    resources = var.eks_cluster_name != "" ? [
      "arn:aws:eks:${var.region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}",
      "arn:aws:eks:${var.region}:${var.aws_account_id}:nodegroup/${var.eks_cluster_name}/*",
    ] : ["*"]
  }

  #── Auto Scaling — scale node group ASG for node replacement ─────────────────
  statement {
    sid    = "AutoScaling"
    effect = "Allow"
    actions = [
      "autoscaling:DescribeAutoScalingGroups",
      "autoscaling:DescribeAutoScalingInstances",
      "autoscaling:SetDesiredCapacity",
      "autoscaling:UpdateAutoScalingGroup",
      "autoscaling:StartInstanceRefresh",
    ]
    resources = ["*"]
  }

  #── RDS — describe instances and reboot ──────────────────────────────────────
  statement {
    sid    = "RDS"
    effect = "Allow"
    actions = [
      "rds:DescribeDBInstances",
      "rds:DescribeDBParameters",
      "rds:DescribeDBParameterGroups",
    ]
    resources = var.rds_instance_id != "" ? [
      "arn:aws:rds:${var.region}:${var.aws_account_id}:db:${var.rds_instance_id}",
    ] : ["*"]
  }

  #── Secrets Manager — GitHub token + any other secrets ──────────────────────
  statement {
    sid    = "SecretsManager"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
    ]
    resources = compact([var.github_token_secret_arn])
  }

  #── SNS — publish healing summaries and alerts ────────────────────────────────
  statement {
    sid    = "SNS"
    effect = "Allow"
    actions = [
      "sns:Publish",
    ]
    resources = [aws_sns_topic.healing_triggers.arn]
  }

  #── Lambda — allow scale-in scheduler to add this Lambda as an EventBridge target
  statement {
    sid    = "LambdaAddPermission"
    effect = "Allow"
    actions = [
      "lambda:AddPermission",
      "lambda:RemovePermission",
    ]
    resources = [
      "arn:aws:lambda:${var.region}:${var.aws_account_id}:function:${var.project_name}-scale-in-scheduler",
    ]
  }
}

#Creates the AWS IAM policy resource named self healing.
resource "aws_iam_policy" "self_healing" {
  name        = "${var.project_name}-self-healing-controller"
  description = "Self-healing controller Lambda execution policy"
  policy      = data.aws_iam_policy_document.self_healing.json
  tags        = var.tags
}

#Creates the AWS IAM role policy attachment resource named self healing.
resource "aws_iam_role_policy_attachment" "self_healing" {
  role       = aws_iam_role.self_healing.name
  policy_arn = aws_iam_policy.self_healing.arn
}

#── Scale-in scheduler Lambda role ───────────────────────────────────────────

data "aws_iam_policy_document" "scale_in_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

#Creates the AWS IAM role resource named scale in scheduler.
resource "aws_iam_role" "scale_in_scheduler" {
  name               = "${var.project_name}-scale-in-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scale_in_assume.json
  tags               = var.tags
}

#Reads the AWS IAM policy document data source named scale in scheduler.
data "aws_iam_policy_document" "scale_in_scheduler" {
  statement {
    sid    = "CloudWatchLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:${var.region}:${var.aws_account_id}:log-group:/aws/lambda/${var.project_name}-scale-in-scheduler:*"]
  }

  statement {
    sid       = "CloudWatchMetrics"
    effect    = "Allow"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
  }

  statement {
    sid    = "EKSDescribe"
    effect = "Allow"
    actions = [
      "eks:DescribeCluster",
    ]
    resources = var.eks_cluster_name != "" ? [
      "arn:aws:eks:${var.region}:${var.aws_account_id}:cluster/${var.eks_cluster_name}",
    ] : ["*"]
  }
}

#Creates the AWS IAM policy resource named scale in scheduler.
resource "aws_iam_policy" "scale_in_scheduler" {
  name   = "${var.project_name}-scale-in-scheduler"
  policy = data.aws_iam_policy_document.scale_in_scheduler.json
  tags   = var.tags
}

#Creates the AWS IAM role policy attachment resource named scale in scheduler.
resource "aws_iam_role_policy_attachment" "scale_in_scheduler" {
  role       = aws_iam_role.scale_in_scheduler.name
  policy_arn = aws_iam_policy.scale_in_scheduler.arn
}
