#CloudOps Root Outputs

#Bootstrap
output "bootstrap_bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = var.destroy_all ? null : module.bootstrap[0].bucket_name
}

#Exposes the bootstrap KMS key arn output value.
output "bootstrap_kms_key_arn" {
  description = "KMS key ARN for state encryption"
  value       = var.destroy_all ? null : (var.bootstrap_create_kms ? module.bootstrap[0].kms_key_arn : null)
}

#Networking
output "vpc_id" {
  description = "VPC ID"
  value       = var.enable_networking ? module.networking[0].vpc_id : null
}

#EKS
output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = var.enable_eks ? module.eks[0].cluster_name : null
}

#Exposes the EKS cluster endpoint output value.
output "eks_cluster_endpoint" {
  description = "EKS cluster API server endpoint"
  value       = var.enable_eks ? module.eks[0].cluster_endpoint : null
}

#Exposes the order API irsa role arn output value.
output "order_api_irsa_role_arn" {
  description = "IRSA role ARN for the order-api service account"
  value       = var.enable_eks ? module.eks[0].order_api_irsa_role_arn : null
}

#Exposes the order API API key secret arn output value.
output "order_api_api_key_secret_arn" {
  description = "Secrets Manager ARN that the order-api Pod reads via API_KEY_SECRET_ARN. Source of truth for the app deploy assertion (closes backlog #37). Empty = unauthenticated dev mode (NODE_ENV must be dev/test/local)."
  value       = var.order_api_api_key_secret_arn
}

#Ingress
output "acm_certificate_arn" {
  description = "ACM wildcard certificate ARN"
  value       = var.enable_ingress ? module.ingress[0].certificate_arn : null
}

#Exposes the route53 name servers output value.
output "route53_name_servers" {
  description = "Route 53 name servers for the project domain — point your registrar's NS records at these after the first dns apply"
  value       = !var.destroy_all ? module.dns[0].name_servers : null
}

#CodeArtifact
output "codeartifact_domain_name" {
  description = "CodeArtifact domain name for CloudOps client libraries."
  value       = var.enable_codeartifact ? module.codeartifact[0].domain_name : ""
}

#Exposes the codeartifact repository names output value.
output "codeartifact_repository_names" {
  description = "CodeArtifact repository names keyed by logical repository name."
  value       = var.enable_codeartifact ? module.codeartifact[0].repository_names : {}
}

#Exposes the codeartifact repository arns output value.
output "codeartifact_repository_arns" {
  description = "CodeArtifact repository ARNs keyed by logical repository name."
  value       = var.enable_codeartifact ? module.codeartifact[0].repository_arns : {}
}

#Database
output "database_endpoint" {
  description = "Primary RDS instance endpoint (host:port)"
  value       = var.enable_database ? module.database[0].rds_endpoint : null
}

#Exposes the database secret arn output value.
output "database_secret_arn" {
  description = "Secrets Manager ARN containing database credentials"
  value       = var.enable_database ? module.database[0].rds_secret_arn : null
}

#Exposes the database connection info output value.
output "database_connection_info" {
  description = "CLI command to retrieve database credentials"
  value       = var.enable_database ? "aws secretsmanager get-secret-value --secret-id ${module.database[0].rds_secret_name} --query SecretString --output text | jq ." : null
}

#Application
output "order_api_url" {
  description = "Order API public URL"
  value       = "https://api.${var.domain_name}"
}

#Observability (only populated when enable_observability = true)
output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = var.enable_observability ? module.observability[0].grafana_url : null
}

#Exposes the grafana admin password output value.
output "grafana_admin_password" {
  description = "Grafana admin password (sensitive)"
  value       = var.enable_observability ? module.observability[0].grafana_admin_password : null
  sensitive   = true
}

#Exposes the OTel endpoint output value.
output "otel_endpoint" {
  description = "OTel Collector HTTPS endpoint"
  value       = var.enable_observability ? module.observability[0].otel_endpoint : null
}

#Exposes the OTel URL output value.
output "otel_url" {
  description = "Public URL for the OTel Collector (otel.<domain>) — populated once otel_alb_dns_name is set. Closes backlog #17."
  value       = var.enable_observability && var.otel_alb_dns_name != "" ? "https://otel.${var.domain_name}" : null
}

#Exposes the OTel API key output value.
output "otel_api_key" {
  description = "OTel Collector bearer token (sensitive)"
  value       = var.enable_observability ? module.observability[0].otel_api_key : null
  sensitive   = true
}

#Exposes the OTel SSM parameter names output value.
output "otel_ssm_parameter_names" {
  description = "SSM Parameter Store names for OTel SDK/client configuration"
  value       = var.enable_observability ? module.observability[0].otel_ssm_parameter_names : {}
}

#Exposes the OTel SSM parameter arns output value.
output "otel_ssm_parameter_arns" {
  description = "SSM Parameter Store ARNs for OTel SDK/client configuration"
  value       = var.enable_observability ? module.observability[0].otel_ssm_parameter_arns : {}
}

#Exposes the grafana API key secret arn output value.
output "grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN for the Grafana Viewer service account token (used by the SLO Lambda)"
  value       = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : null
}

#Self-Healing
output "self_healing_sns_topic_arn" {
  description = "Self-healing triggers SNS topic ARN"
  value       = var.enable_self_healing ? module.self_healing[0].sns_topic_arn : null
}

#Exposes the self healing dashboard URL output value.
output "self_healing_dashboard_url" {
  description = "CloudWatch Logs Insights URL for self-healing controller logs"
  value       = var.enable_self_healing ? module.self_healing[0].healing_dashboard_url : null
}
