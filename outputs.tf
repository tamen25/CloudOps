# CloudOps Root Outputs

# Bootstrap
output "bootstrap_bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = var.destroy_all ? null : module.bootstrap[0].bucket_name
}

output "bootstrap_kms_key_arn" {
  description = "KMS key ARN for state encryption"
  value       = var.destroy_all ? null : (var.bootstrap_create_kms ? module.bootstrap[0].kms_key_arn : null)
}

# Networking
output "vpc_id" {
  description = "VPC ID"
  value       = var.enable_networking ? module.networking[0].vpc_id : null
}

# EKS
output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = var.enable_eks ? module.eks[0].cluster_name : null
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = var.enable_eks ? module.eks[0].cluster_endpoint : null
}

output "order_api_irsa_role_arn" {
  description = "IRSA role ARN for the order-api service account"
  value       = var.enable_eks ? module.eks[0].order_api_irsa_role_arn : null
}

# Ingress
output "acm_certificate_arn" {
  description = "ACM wildcard certificate ARN"
  value       = var.enable_ingress ? module.ingress[0].certificate_arn : null
}

output "route53_name_servers" {
  description = "tamendutta.com name servers — update your registrar to these after first ingress apply"
  value       = var.enable_ingress ? module.ingress[0].route53_name_servers : null
}

# Database
output "database_endpoint" {
  description = "Primary RDS instance endpoint (host:port)"
  value       = var.enable_database ? module.database[0].rds_endpoint : null
}

output "database_secret_arn" {
  description = "Secrets Manager ARN containing database credentials"
  value       = var.enable_database ? module.database[0].rds_secret_arn : null
}

output "database_connection_info" {
  description = "CLI command to retrieve database credentials"
  value       = var.enable_database ? "aws secretsmanager get-secret-value --secret-id ${module.database[0].rds_secret_name} --query SecretString --output text | jq ." : null
}

# Application
output "order_api_url" {
  description = "Order API public URL"
  value       = "https://api.tamendutta.com"
}

# Observability (only populated when enable_observability = true)
output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = var.enable_observability ? module.observability[0].grafana_url : null
}

output "grafana_admin_password" {
  description = "Grafana admin password (sensitive)"
  value       = var.enable_observability ? module.observability[0].grafana_admin_password : null
  sensitive   = true
}

output "otel_endpoint" {
  description = "OTel Collector HTTPS endpoint"
  value       = var.enable_observability ? module.observability[0].otel_endpoint : null
}

output "otel_api_key" {
  description = "OTel Collector bearer token (sensitive)"
  value       = var.enable_observability ? module.observability[0].otel_api_key : null
  sensitive   = true
}

output "grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN for the Grafana Viewer service account token (used by the SLO Lambda)"
  value       = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : null
}

# Self-Healing
output "self_healing_sns_topic_arn" {
  description = "Self-healing triggers SNS topic ARN"
  value       = var.enable_self_healing ? module.self_healing[0].sns_topic_arn : null
}

output "self_healing_dashboard_url" {
  description = "CloudWatch Logs Insights URL for self-healing controller logs"
  value       = var.enable_self_healing ? module.self_healing[0].healing_dashboard_url : null
}
