# SNS topic and subscriptions for compliance scanner alerts.
#
# Two subscriptions use two different email addresses:
#   security_alert_email   — receives all findings (INFO through CRITICAL)
#   security_critical_email — receives HIGH and CRITICAL only (via SNS filter policy)
#
# The Lambda publishes every finding with a MessageAttribute:
#   severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
# The filter policy on the second subscription matches on that attribute.
# If security_critical_email is empty the second subscription is skipped.

resource "aws_sns_topic" "security_alerts" {
  name              = "${var.project_name}-security-alerts"
  display_name      = "CloudOps Security Alerts"
  kms_master_key_id = "alias/aws/sns"

  tags = merge(var.tags, {
    Name      = "${var.project_name}-security-alerts"
    Component = "security"
  })
}

# All-severity subscription — every finding reaches this inbox.
resource "aws_sns_topic_subscription" "security_alerts_all" {
  count = var.security_alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.security_alert_email
}

# HIGH/CRITICAL-only subscription — pager / on-call inbox.
# SNS evaluates the filter_policy against MessageAttributes published by the Lambda.
# Only messages where severity ∈ {HIGH, CRITICAL} are delivered to this address.
resource "aws_sns_topic_subscription" "security_alerts_critical" {
  count = var.security_critical_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.security_alerts.arn
  protocol  = "email"
  endpoint  = var.security_critical_email

  # filter_policy_scope defaults to "MessageAttributes" — matches on the
  # MessageAttributes map the Lambda sets on each Publish call.
  filter_policy = jsonencode({
    severity = ["HIGH", "CRITICAL"]
  })
}
