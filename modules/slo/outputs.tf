output "lambda_arn" {
  description = "ARN of the error-budget-tracker Lambda function"
  value       = aws_lambda_function.error_budget_tracker.arn
}

output "lambda_function_name" {
  description = "Name of the error-budget-tracker Lambda function"
  value       = aws_lambda_function.error_budget_tracker.function_name
}

output "dynamodb_table_name" {
  description = "Name of the DynamoDB table storing error budget snapshots"
  value       = aws_dynamodb_table.error_budgets.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB error budgets table"
  value       = aws_dynamodb_table.error_budgets.arn
}
