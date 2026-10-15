#Database Module Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "db_subnet_group_name" {
  description = "Name of the DB subnet group (created by networking module)"
  type        = string
}

variable "rds_security_group_id" {
  description = "Security group ID for RDS instance"
  type        = string
}

#Database Configuration

variable "engine" {
  description = "Database engine (postgres, mysql, etc.)"
  type        = string
  default     = "postgres"
}

variable "engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.5"
}

variable "instance_class" {
  description = "RDS instance class (e.g., db.t3.micro for dev, db.r6g.large for prod)"
  type        = string
}

variable "allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Maximum storage for autoscaling (0 to disable)"
  type        = number
  default     = 100
}

variable "storage_type" {
  description = "Storage type (gp2, gp3, io1)"
  type        = string
  default     = "gp3"
}

variable "iops" {
  description = "Provisioned IOPS (only for io1/gp3)"
  type        = number
  default     = null
}

variable "storage_throughput" {
  description = "Storage throughput in MB/s (only for gp3)"
  type        = number
  default     = null
}

#High Availability

variable "multi_az" {
  description = "Enable Multi-AZ deployment for automatic failover"
  type        = bool
  default     = true
}

variable "create_read_replica" {
  description = "Create a read replica for DR/scaling"
  type        = bool
  default     = false
}

#Database Settings

variable "database_name" {
  description = "Initial database name to create"
  type        = string
  default     = "cloudops"
}

variable "database_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "master_username" {
  description = "Master username for database"
  type        = string
  default     = "dbadmin"
}

variable "parameter_family" {
  description = "Database parameter group family"
  type        = string
  default     = "postgres15"
}

#Backup & Recovery

variable "backup_retention_period" {
  description = "Number of days to retain automated backups (0-35)"
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Preferred backup window (UTC)"
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Preferred maintenance window (UTC)"
  type        = string
  default     = "sun:04:00-sun:05:00"
}

variable "skip_final_snapshot" {
  description = "Skip final snapshot on deletion (set false for production)"
  type        = bool
  default     = false
}

variable "final_snapshot_identifier" {
  description = "Name of final snapshot (if skip_final_snapshot is false)"
  type        = string
  default     = null
}

variable "copy_tags_to_snapshot" {
  description = "Copy tags to snapshots"
  type        = bool
  default     = true
}

#Security

variable "deletion_protection" {
  description = "Enable deletion protection (recommended for production)"
  type        = bool
  default     = true
}

variable "storage_encrypted" {
  description = "Enable storage encryption at rest"
  type        = bool
  default     = true
}

variable "kms_key_id" {
  description = "KMS key ARN for encryption (uses default aws/rds if not specified)"
  type        = string
  default     = null
}

variable "iam_database_authentication_enabled" {
  description = "Enable IAM database authentication"
  type        = bool
  default     = false
}

variable "rotation_enabled" {
  description = "Enable Secrets Manager rotation for the DB credential secret. Requires rotation_lambda_arn pointing at a deployed rotation Lambda (e.g. AWS SAR SecretsManagerRDSPostgreSQLRotationSingleUser)."
  type        = bool
  default     = false
}

variable "rotation_lambda_arn" {
  description = "ARN of the rotation Lambda. AWS publishes templates in SAR; deploy SecretsManagerRDSPostgreSQLRotationSingleUser and pass the resulting Lambda ARN here. Leave empty when rotation_lambda_auto_deploy = true to let this module deploy the SAR app itself."
  type        = string
  default     = ""
}

variable "rotation_lambda_auto_deploy" {
  description = "When true and rotation_lambda_arn is empty, this module deploys the SAR app SecretsManagerRDSPostgreSQLRotationSingleUser via CloudFormation and wires the resulting Lambda ARN into the secret rotation. Requires rotation_lambda_subnet_ids and rotation_lambda_security_group_id."
  type        = bool
  default     = false
}

variable "rotation_lambda_subnet_ids" {
  description = "Private subnet IDs for the SAR rotation Lambda's VPC config. Must reach the RDS instance and Secrets Manager (via VPC endpoint or NAT)."
  type        = list(string)
  default     = []
}

variable "rotation_lambda_security_group_id" {
  description = "Security group ID for the SAR rotation Lambda. Must allow egress to RDS on the database port and 443 to Secrets Manager."
  type        = string
  default     = ""
}

variable "rotation_lambda_endpoint" {
  description = "Secrets Manager VPC endpoint URL the rotation Lambda should call (e.g. https://secretsmanager.<region>.amazonaws.com). Default uses the public AWS endpoint."
  type        = string
  default     = ""
}

variable "rotation_days" {
  description = "Days between automatic rotations."
  type        = number
  default     = 30
}

variable "rotation_sar_semantic_version" {
  description = "SemVer pin for the SAR `SecretsManagerRDSPostgreSQLRotationSingleUser` app. Closes backlog #29 — was previously `null` (latest). Bump after testing against the configured RDS engine version."
  type        = string
  default     = "1.1.656"
}

#── Logging knobs (closes backlog #41) ────────────────────────────────────────
#Defaults stay dev-friendly. Production should set:
#log_statement                 = "ddl"   (or "none")
#log_duration                  = false
#log_min_duration_statement_ms = 500    (only log slow queries)

variable "log_connections" {
  description = "Postgres `log_connections` parameter (logs every accepted connection). Default true for dev/audit; flip false in prod once perf monitoring is dialed."
  type        = bool
  default     = true
}

variable "log_disconnections" {
  description = "Postgres `log_disconnections` parameter."
  type        = bool
  default     = true
}

variable "log_duration" {
  description = "Postgres `log_duration` parameter (logs the duration of every completed statement). NOISY — prefer `log_min_duration_statement_ms` in prod."
  type        = bool
  default     = true
}

variable "log_statement" {
  description = "Postgres `log_statement` parameter. `all` logs every DML/DDL — leaks customer payloads. Production should use `ddl` (or `none`)."
  type        = string
  default     = "all"

  validation {
    condition     = contains(["none", "ddl", "mod", "all"], var.log_statement)
    error_message = "log_statement must be one of: none, ddl, mod, all."
  }
}

variable "log_min_duration_statement_ms" {
  description = "Log statements slower than this many milliseconds. -1 = disabled. 0 = log all (equivalent to log_statement=all). Production: set to 500–1000 to capture slow queries without leaking every payload."
  type        = number
  default     = -1
}

variable "secret_recovery_window_days" {
  description = "Days a deleted secret stays recoverable before permanent deletion. 0 = immediate (use only for test envs)."
  type        = number
  default     = 7
}

variable "publicly_accessible" {
  description = "Make database publicly accessible (NEVER true for production)"
  type        = bool
  default     = false
}

#Monitoring & Logging

variable "enabled_cloudwatch_logs_exports" {
  description = "List of log types to export to CloudWatch (postgresql, upgrade, etc.)"
  type        = list(string)
  default     = ["postgresql", "upgrade"]
}

variable "performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "performance_insights_retention_period" {
  description = "Performance Insights retention period in days (7, 731)"
  type        = number
  default     = 7
}

variable "monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60
}

#Auto Minor Version Upgrade

variable "auto_minor_version_upgrade" {
  description = "Enable automatic minor version upgrades"
  type        = bool
  default     = true
}

#Tags

variable "tags" {
  description = "Additional tags for all resources"
  type        = map(string)
  default     = {}
}
