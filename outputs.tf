# CloudOps Root Outputs
# Expose key information from all modules

# Bootstrap Outputs
output "bootstrap_bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = var.destroy_all ? null : module.bootstrap[0].bucket_name
}

output "bootstrap_kms_key_arn" {
  description = "KMS key ARN for state encryption"
  value       = var.destroy_all ? null : (var.bootstrap_create_kms ? module.bootstrap[0].kms_key_arn : null)
}

# Networking Outputs
output "vpc_id" {
  description = "VPC ID"
  value       = var.enable_networking ? module.networking[0].vpc_id : null
}

output "alb_dns_name" {
  description = "ALB DNS name for application access"
  value       = var.enable_compute ? module.compute[0].alb_dns_name : null
}

output "alb_arn" {
  description = "ALB ARN"
  value       = var.enable_compute ? module.compute[0].alb_arn : null
}

# Compute Outputs
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = var.enable_compute ? module.compute[0].ecs_cluster_name : null
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = var.enable_compute ? module.compute[0].ecs_service_name : null
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = var.enable_compute ? module.compute[0].ecr_repository_url : null
}

# Database Outputs
output "database_endpoint" {
  description = "Primary RDS instance endpoint (host:port)"
  value       = var.enable_database ? module.database[0].rds_endpoint : null
}

output "database_address" {
  description = "Primary RDS instance hostname"
  value       = var.enable_database ? module.database[0].rds_address : null
}

output "database_port" {
  description = "RDS instance port"
  value       = var.enable_database ? module.database[0].rds_port : null
}

output "database_secret_arn" {
  description = "Secrets Manager ARN containing database credentials"
  value       = var.enable_database ? module.database[0].rds_secret_arn : null
}

output "database_replica_endpoint" {
  description = "Read replica endpoint (null if not created)"
  value       = var.enable_database ? module.database[0].rds_replica_endpoint : null
}

output "database_name" {
  description = "Initial database name"
  value       = var.enable_database ? module.database[0].database_name : null
}

# Application Access Instructions
output "application_url" {
  description = "Application access URL"
  value       = var.enable_compute ? "http://${module.compute[0].alb_dns_name}" : null
}

output "database_connection_info" {
  description = "How to retrieve database credentials"
  value       = var.enable_database ? "aws secretsmanager get-secret-value --secret-id ${module.database[0].rds_secret_name} --query SecretString --output text | jq ." : null
}
