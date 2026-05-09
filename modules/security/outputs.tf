#This file defines outputs settings for CloudOps.
output "falco_namespace" {
  description = "Kubernetes namespace where Falco is deployed"
  value       = kubernetes_namespace.falco.metadata[0].name
}

#Exposes the falcosidekick URL output value.
output "falcosidekick_url" {
  description = "Internal cluster URL for the Falcosidekick webhook receiver"
  value       = "http://falco-falcosidekick.${kubernetes_namespace.falco.metadata[0].name}.svc.cluster.local:2801"
}

#Exposes the compliance scanner function arn output value.
output "compliance_scanner_function_arn" {
  description = "ARN of the compliance scanner Lambda function"
  value       = aws_lambda_function.compliance_scanner.arn
}

#Exposes the security findings table arn output value.
output "security_findings_table_arn" {
  description = "ARN of the DynamoDB table storing compliance scanner findings"
  value       = aws_dynamodb_table.security_findings.arn
}

#Exposes the security findings table name output value.
output "security_findings_table_name" {
  description = "Name of the DynamoDB table storing compliance scanner findings"
  value       = aws_dynamodb_table.security_findings.name
}

#Exposes the security alerts topic arn output value.
output "security_alerts_topic_arn" {
  description = "ARN of the SNS topic that receives compliance scanner alerts"
  value       = aws_sns_topic.security_alerts.arn
}

#Exposes the auto remediation function arn output value.
output "auto_remediation_function_arn" {
  description = "ARN of the auto-remediation Lambda function"
  value       = aws_lambda_function.auto_remediation.arn
}

#Exposes the kube bench processor function arn output value.
output "kube_bench_processor_function_arn" {
  description = "ARN of the kube-bench processor Lambda function"
  value       = aws_lambda_function.kube_bench_processor.arn
}

#Exposes the kube bench processor function name output value.
output "kube_bench_processor_function_name" {
  description = "Name of the kube-bench processor Lambda function"
  value       = aws_lambda_function.kube_bench_processor.function_name
}
