output "falco_namespace" {
  description = "Kubernetes namespace where Falco is deployed"
  value       = kubernetes_namespace.falco.metadata[0].name
}

output "falcosidekick_url" {
  description = "Internal cluster URL for the Falcosidekick webhook receiver"
  value       = "http://falco-falcosidekick.${kubernetes_namespace.falco.metadata[0].name}.svc.cluster.local:2801"
}

output "compliance_scanner_function_arn" {
  description = "ARN of the compliance scanner Lambda function"
  value       = aws_lambda_function.compliance_scanner.arn
}

output "security_findings_table_arn" {
  description = "ARN of the DynamoDB table storing compliance scanner findings"
  value       = aws_dynamodb_table.security_findings.arn
}

output "security_findings_table_name" {
  description = "Name of the DynamoDB table storing compliance scanner findings"
  value       = aws_dynamodb_table.security_findings.name
}

output "security_alerts_topic_arn" {
  description = "ARN of the SNS topic that receives compliance scanner alerts"
  value       = aws_sns_topic.security_alerts.arn
}

output "auto_remediation_function_arn" {
  description = "ARN of the auto-remediation Lambda function"
  value       = aws_lambda_function.auto_remediation.arn
}

output "kube_bench_processor_function_arn" {
  description = "ARN of the kube-bench processor Lambda function"
  value       = aws_lambda_function.kube_bench_processor.arn
}

output "kube_bench_processor_function_name" {
  description = "Name of the kube-bench processor Lambda function"
  value       = aws_lambda_function.kube_bench_processor.function_name
}
