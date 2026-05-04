# Self-Healing Controller — CloudWatch Alarms
#
# All alarms publish to the cloudops-healing-triggers SNS topic.
# The alarm name is the routing key in the Lambda handler.
# ALB alarms are created only when alb_arn_suffix is provided.
# RDS alarms are created only when rds_instance_id is provided.

locals {
  # Alarm name prefix — Lambda routes on contains() of these names
  alarm_prefix = "${var.project_name}-${var.environment}"
  create_alb   = var.alb_arn_suffix != "" && var.target_group_arn_suffix != ""
  create_rds   = var.rds_instance_id != ""
  create_eks   = var.eks_cluster_name != ""
}

# ── order-api: High Error Rate — triggers rollback ───────────────────────────

resource "aws_cloudwatch_metric_alarm" "order_api_high_error_rate" {
  count = local.create_alb ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-order-api-high-error-rate"
  alarm_description   = "order-api 5xx error count > 10 in 5 minutes — triggers automatic rollback"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 10

  metric_name = "HTTPCode_Target_5XX_Count"
  namespace   = "AWS/ApplicationELB"
  statistic   = "Sum"
  period      = 300

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]
  ok_actions         = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── order-api: High Latency — triggers scale-out ─────────────────────────────

resource "aws_cloudwatch_metric_alarm" "order_api_high_latency" {
  count = local.create_alb ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-order-api-high-latency"
  alarm_description   = "order-api p99 latency > 2 seconds for 3 consecutive 1-minute periods — triggers scale out"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  threshold           = 2

  metric_name        = "TargetResponseTime"
  namespace          = "AWS/ApplicationELB"
  extended_statistic = "p99"
  period             = 60

  dimensions = {
    LoadBalancer = var.alb_arn_suffix
    TargetGroup  = var.target_group_arn_suffix
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── order-api: Pod count low — triggers ensure-minimum-pods ─────────────────
# Uses Container Insights pod_number_of_running_pods in cloudops namespace.

resource "aws_cloudwatch_metric_alarm" "order_api_pod_count_low" {
  count = local.create_eks ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-order-api-pod-count-low"
  alarm_description   = "order-api running pod count < ${var.min_healthy_pods} for 2 minutes — triggers ensure-minimum-pods healing"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  threshold           = var.min_healthy_pods

  metric_name = "pod_number_of_running_pods"
  namespace   = "ContainerInsights"
  statistic   = "Average"
  period      = 60

  dimensions = {
    ClusterName = var.eks_cluster_name
    Namespace   = var.application_namespace
    Service     = "order-api"
  }

  treat_missing_data = "breaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── RDS: High Connections ─────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_high_connections" {
  count = local.create_rds ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-rds-high-connections"
  alarm_description   = "RDS connection count > 80 for 2 consecutive periods — triggers connection pool alert"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 80

  metric_name = "DatabaseConnections"
  namespace   = "AWS/RDS"
  statistic   = "Average"
  period      = 60

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── RDS: High CPU ─────────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_high_cpu" {
  count = local.create_rds ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-rds-high-cpu"
  alarm_description   = "RDS CPU > 80% for 2 consecutive periods — triggers read replica recommendation"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  threshold           = 80

  metric_name = "CPUUtilization"
  namespace   = "AWS/RDS"
  statistic   = "Average"
  period      = 60

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── RDS: Low Storage ─────────────────────────────────────────────────────────

resource "aws_cloudwatch_metric_alarm" "rds_low_storage" {
  count = local.create_rds ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-rds-low-storage"
  alarm_description   = "RDS free storage < 2 GB — triggers storage exhaustion forecast and alert"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  threshold           = 2147483648 # 2 GB in bytes

  metric_name = "FreeStorageSpace"
  namespace   = "AWS/RDS"
  statistic   = "Average"
  period      = 300

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}

# ── EKS: Node Not Ready ───────────────────────────────────────────────────────
# Reads the NodeNotReady custom metric published by the kube-bench CronJob
# and the self-healing Lambda itself. Triggers node cordon + replacement.

resource "aws_cloudwatch_metric_alarm" "eks_node_not_ready" {
  count = local.create_eks ? 1 : 0

  alarm_name          = "${local.alarm_prefix}-eks-node-not-ready"
  alarm_description   = "EKS NodeNotReady count > 0 — triggers node cordon and ASG instance refresh"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = 0

  metric_name = "NodeNotReady"
  namespace   = "CloudOps/SelfHealing"
  statistic   = "Maximum"
  period      = 60

  dimensions = {
    ClusterName = var.eks_cluster_name
    Environment = var.environment
  }

  treat_missing_data = "notBreaching"
  alarm_actions      = [aws_sns_topic.healing_triggers.arn]

  tags = var.tags
}
