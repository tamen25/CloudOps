#This file defines budget settings for CloudOps.
#FinOps Module — AWS Budgets + SNS cost alerts
#
#SNS topic receives budget threshold notifications and Lambda anomaly alerts.
#A resource policy allows budgets.amazonaws.com to publish to the topic.
#Budget notifications:
#80%  of monthly limit → WARNING
#100% of monthly limit → CRITICAL

resource "aws_sns_topic" "cost_alerts" {
  name              = "${var.project_name}-cost-alerts"
  kms_master_key_id = "alias/aws/sns"
  tags              = var.tags
}

#Allow AWS Budgets to publish notifications to this topic
resource "aws_sns_topic_policy" "cost_alerts" {
  arn = aws_sns_topic.cost_alerts.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowBudgetsPublish"
        Effect    = "Allow"
        Principal = { Service = "budgets.amazonaws.com" }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.cost_alerts.arn
      },
      {
        Sid       = "AllowLambdaPublish"
        Effect    = "Allow"
        Principal = { AWS = aws_iam_role.cost_ingestion.arn }
        Action    = "SNS:Publish"
        Resource  = aws_sns_topic.cost_alerts.arn
      }
    ]
  })
}

#Creates the AWS sns topic subscription resource named cost alerts email.
resource "aws_sns_topic_subscription" "cost_alerts_email" {
  count     = var.cost_alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.cost_alerts.arn
  protocol  = "email"
  endpoint  = var.cost_alert_email
}

#Creates the AWS budgets budget resource named monthly.
resource "aws_budgets_budget" "monthly" {
  name         = "${var.project_name}-monthly-budget"
  budget_type  = "COST"
  limit_amount = tostring(var.cost_budget_monthly_usd)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  #WARNING at 80% actual spend
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.cost_alerts.arn]
    subscriber_email_addresses = var.cost_alert_email != "" ? [var.cost_alert_email] : []
  }

  #CRITICAL at 100% actual spend
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_sns_topic_arns  = [aws_sns_topic.cost_alerts.arn]
    subscriber_email_addresses = var.cost_alert_email != "" ? [var.cost_alert_email] : []
  }

  tags = var.tags
}
