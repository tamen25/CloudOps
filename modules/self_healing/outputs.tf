output "lambda_arn" {
  description = "Self-healing controller Lambda ARN"
  value       = aws_lambda_function.self_healing_controller.arn
}

#Exposes the sns topic arn output value.
output "sns_topic_arn" {
  description = "Healing triggers SNS topic ARN — CloudWatch Alarms publish here to invoke the controller"
  value       = aws_sns_topic.healing_triggers.arn
}

#Exposes the scale in scheduler arn output value.
output "scale_in_scheduler_arn" {
  description = "Scale-in scheduler Lambda ARN — referenced by the controller when creating one-time EventBridge rules"
  value       = aws_lambda_function.scale_in_scheduler.arn
}

#Exposes the healing dashboard URL output value.
output "healing_dashboard_url" {
  description = "CloudWatch Logs Insights URL for self-healing controller logs"
  value       = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#logsV2:log-groups/log-group/$252Faws$252Flambda$252F${var.project_name}-self-healing-controller"
}
