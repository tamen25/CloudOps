output "ws_url" {
  description = "WebSocket URL. Custom domain wins when create_custom_domain=true."
  value       = var.create_custom_domain ? "wss://${var.ws_subdomain}.${var.domain_name}" : "wss://${aws_apigatewayv2_api.ws.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.default.name}"
}

output "ws_api_id" {
  value = aws_apigatewayv2_api.ws.id
}

output "connections_table_name" {
  value = aws_dynamodb_table.connections.name
}

output "fanout_function_name" {
  value = aws_lambda_function.fanout.function_name
}
