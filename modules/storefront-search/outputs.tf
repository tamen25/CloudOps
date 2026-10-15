output "api_endpoint" {
  description = "API Gateway invoke URL (use the custom domain when set)."
  value       = var.create_custom_domain ? "https://${local.search_host}" : aws_apigatewayv2_api.search.api_endpoint
}

output "lambda_function_name" {
  value = aws_lambda_function.search_gateway.function_name
}

output "lambda_role_arn" {
  value = aws_iam_role.search_gateway.arn
}

output "lambda_security_group_id" {
  value = aws_security_group.lambda.id
}

output "api_gateway_id" {
  value = aws_apigatewayv2_api.search.id
}
