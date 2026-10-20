output "lambda_arn" {
  description = "ARN of the cost ingestion Lambda function"
  value       = aws_lambda_function.cost_ingestion.arn
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB cost history table"
  value       = aws_dynamodb_table.cost_data.name
}

output "sns_topic_arn" {
  description = "ARN of the cost alerts SNS topic"
  value       = aws_sns_topic.cost_alerts.arn
}

output "budget_name" {
  description = "Name of the AWS Budget"
  value       = aws_budgets_budget.monthly.name
}

#Exposes whether the hard-cap action is active (#139).
output "budget_hardcap_action_id" {
  description = "ID of the budget hard-cap action when enabled, else null."
  value       = local.budget_hardcap_enabled ? aws_budgets_budget_action.hardcap[0].action_id : null
}
