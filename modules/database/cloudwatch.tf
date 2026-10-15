#Monitor database CPU utilization and trigger alarm if it exceeds 80% for 10 minutes
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.name_prefix}-db-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Database CPU utilization is too high"
  alarm_actions       = []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }

  tags = local.common_tags
}

#Monitor freeable memory and trigger alarm if it falls below 256MB for 10 minutes
resource "aws_cloudwatch_metric_alarm" "database_memory" {
  alarm_name          = "${var.name_prefix}-db-freeable-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "FreeableMemory"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 256000000
  alarm_description   = "Database freeable memory is too low"
  alarm_actions       = []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }

  tags = local.common_tags
}

#Monitor free storage space and trigger alarm if it falls below 2GB
resource "aws_cloudwatch_metric_alarm" "database_storage" {
  alarm_name          = "${var.name_prefix}-db-free-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "FreeStorageSpace"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 2000000000
  alarm_description   = "Database free storage space is too low"
  alarm_actions       = []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }

  tags = local.common_tags
}

#Burstable instance families (t2/t3/t4g) earn CPU credits when idle and spend
#them under load. When the credit balance hits zero the DB drops to baseline
#CPU and latency spikes silently. Alarm before that — 60 credits ≈ 1 hour of
#burst at baseline on db.t3.micro. Only created for burstable instance classes.
resource "aws_cloudwatch_metric_alarm" "database_cpu_credits" {
  count = length(regexall("^db\\.(t2|t3|t4g)\\.", var.instance_class)) > 0 ? 1 : 0

  alarm_name          = "${var.name_prefix}-db-cpu-credit-balance"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUCreditBalance"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 60
  alarm_description   = "Database CPU credit balance is low — burstable instance about to throttle to baseline"
  alarm_actions       = []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }

  tags = local.common_tags
}

#Monitor active database connections and trigger alarm if count exceeds 80 for 10 minutes
resource "aws_cloudwatch_metric_alarm" "database_connections" {
  alarm_name          = "${var.name_prefix}-db-connections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "Database connection count is too high"
  alarm_actions       = []

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.primary.id
  }

  tags = local.common_tags
}
