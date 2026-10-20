output "lambda_arn" {
  description = "ARN of the error-budget-tracker Lambda function"
  value       = aws_lambda_function.error_budget_tracker.arn
}

#Exposes the lambda function name output value.
output "lambda_function_name" {
  description = "Name of the error-budget-tracker Lambda function"
  value       = aws_lambda_function.error_budget_tracker.function_name
}

#Exposes the dynamodb table name output value.
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table storing error budget snapshots"
  value       = aws_dynamodb_table.error_budgets.name
}

#Exposes the dynamodb table arn output value.
output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB error budgets table"
  value       = aws_dynamodb_table.error_budgets.arn
}
