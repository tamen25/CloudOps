output "event_bus_name" {
  description = "Name of the mesh EventBridge bus."
  value       = aws_cloudwatch_event_bus.mesh.name
}

output "event_bus_arn" {
  value = aws_cloudwatch_event_bus.mesh.arn
}

output "enrichment_function_name" {
  value = aws_lambda_function.enrichment.function_name
}

output "analytics_function_name" {
  value = aws_lambda_function.analytics.function_name
}

output "enrichment_dlq_url" {
  value = aws_sqs_queue.enrichment_dlq.url
}
