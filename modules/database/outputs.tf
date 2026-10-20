#Database Module Outputs
#Exposes RDS endpoints, credentials ARN, and monitoring details

#Primary Database Endpoint
output "rds_endpoint" {
  description = "Primary RDS instance endpoint (host:port)"
  value       = aws_db_instance.primary.endpoint
}

output "rds_address" {
  description = "Primary RDS instance hostname"
  value       = aws_db_instance.primary.address
}

output "rds_port" {
  description = "RDS instance port"
  value       = aws_db_instance.primary.port
}

output "rds_instance_id" {
  description = "RDS instance identifier"
  value       = aws_db_instance.primary.id
}

output "rds_arn" {
  description = "RDS instance ARN"
  value       = aws_db_instance.primary.arn
}

output "rds_resource_id" {
  description = "RDS instance resource ID (for IAM policies)"
  value       = aws_db_instance.primary.resource_id
}

#Read Replica Endpoints
output "rds_replica_endpoint" {
  description = "Read replica endpoint (null if not created)"
  value       = var.create_read_replica ? aws_db_instance.replica[0].endpoint : null
}

output "rds_replica_address" {
  description = "Read replica hostname (null if not created)"
  value       = var.create_read_replica ? aws_db_instance.replica[0].address : null
}

output "rds_replica_id" {
  description = "Read replica instance identifier (null if not created)"
  value       = var.create_read_replica ? aws_db_instance.replica[0].id : null
}

#Secrets Manager
output "rds_secret_arn" {
  description = "Secrets Manager ARN containing database credentials"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

output "rds_secret_name" {
  description = "Secrets Manager secret name"
  value       = aws_secretsmanager_secret.db_credentials.name
}

#Database Configuration
output "database_name" {
  description = "Initial database name"
  value       = var.database_name
}

output "master_username" {
  description = "Master username for database"
  value       = var.master_username
}

#Connection String Components
output "connection_string" {
  description = "PostgreSQL connection string template (password must be retrieved from Secrets Manager)"
  value       = "postgresql://${var.master_username}:<PASSWORD>@${aws_db_instance.primary.address}:${aws_db_instance.primary.port}/${var.database_name}"
  sensitive   = true
}

#Monitoring
output "monitoring_role_arn" {
  description = "IAM role ARN for RDS Enhanced Monitoring"
  value       = aws_iam_role.rds_monitoring.arn
}

#High Availability Status
output "multi_az_enabled" {
  description = "Whether Multi-AZ is enabled"
  value       = var.multi_az
}

output "read_replica_enabled" {
  description = "Whether read replica is created"
  value       = var.create_read_replica
}

#Security
output "storage_encrypted" {
  description = "Whether storage is encrypted"
  value       = var.storage_encrypted
}

output "deletion_protection_enabled" {
  description = "Whether deletion protection is enabled"
  value       = var.deletion_protection
}

#Backup Configuration
output "backup_retention_period" {
  description = "Number of days automated backups are retained"
  value       = var.backup_retention_period
}

output "latest_restorable_time" {
  description = "Latest time to which database can be restored with point-in-time restore"
  value       = aws_db_instance.primary.latest_restorable_time
}
