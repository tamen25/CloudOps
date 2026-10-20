#Foundation stack variables — subset of root variables.tf relevant to the
#AWS-only resources owned by this stack (bootstrap, dns, networking,
#database, compliance, backup, codeartifact). Closes backlog #16.
#
#Most values mirror the root tfvars file; reuse the same `terraform.tfvars`
#at the repo root so the operator only maintains one source of truth.

#── Identity ─────────────────────────────────────────────────────────────────

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  type = string
}

variable "owner" {
  type    = string
  default = ""
}

variable "domain_name" {
  type = string
}

variable "aws_account_id" {
  type    = string
  default = ""
}

variable "destroy_all" {
  type    = bool
  default = false
}

#── Module toggles ───────────────────────────────────────────────────────────

variable "enable_networking" {
  type    = bool
  default = false
}

variable "enable_database" {
  type    = bool
  default = false
}

variable "enable_compliance" {
  type    = bool
  default = false
}

variable "enable_backup" {
  type    = bool
  default = false
}

variable "enable_codeartifact" {
  type    = bool
  default = false
}

#── Bootstrap ────────────────────────────────────────────────────────────────

variable "bootstrap_bucket_name" {
  type    = string
  default = ""
}

variable "bootstrap_create_kms" {
  type    = bool
  default = true
}

variable "bootstrap_kms_deletion_window" {
  type    = number
  default = 30
}

variable "bootstrap_additional_trusted_arns" {
  type    = list(string)
  default = []
}

variable "bootstrap_require_mfa" {
  description = "Require MFA to assume the human deployer role (CI uses the OIDC role and is unaffected)"
  type        = bool
  default     = true
}

variable "bootstrap_enable_permissions_boundary" {
  description = "Put the workload permissions boundary on every project role (modules/bootstrap/permissions_boundary.tf). Applied by an administrator; see docs/runbooks/security/permissions-boundary.md."
  type        = bool
  default     = false
}

variable "bootstrap_external_id" {
  type    = string
  default = ""
}

variable "bootstrap_max_session_duration" {
  type    = number
  default = 3600
}

variable "bootstrap_additional_policy_arns" {
  type    = list(string)
  default = []
}

variable "github_token" {
  type      = string
  sensitive = true
  default   = ""
}

variable "security_github_repo" {
  type    = string
  default = ""
}

#── CodeArtifact ────────────────────────────────────────────────────────────

variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

#── Networking ───────────────────────────────────────────────────────────────

variable "az_count" {
  type    = number
  default = 2
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  type    = list(string)
  default = null
}

variable "private_subnet_cidrs" {
  type    = list(string)
  default = null
}

variable "db_subnet_cidrs" {
  type    = list(string)
  default = null
}

variable "enable_nat_gateway" {
  type    = bool
  default = true
}

variable "enable_flow_logs" {
  type    = bool
  default = false
}

variable "flow_logs_destination" {
  type    = string
  default = "cloudwatch"
}

variable "flow_logs_retention_days" {
  type    = number
  default = 7
}

variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

variable "enable_https" {
  type    = bool
  default = true
}

variable "enable_http" {
  type    = bool
  default = true
}

variable "custom_alb_ports" {
  type    = list(number)
  default = []
}

variable "rds_port" {
  type    = number
  default = 5432
}

#── EKS cluster name (used for subnet tags only — cluster owned by cluster stack) ─

#Accepted for shared root terraform.tfvars compatibility.
#tflint-ignore: terraform_unused_declarations
variable "eks_kubernetes_version" {
  type    = string
  default = "1.32"
}

#── Database ─────────────────────────────────────────────────────────────────

variable "database_instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "database_allocated_storage" {
  type    = number
  default = 20
}

variable "database_max_allocated_storage" {
  type    = number
  default = 100
}

variable "database_engine" {
  type    = string
  default = "postgres"
}

variable "database_engine_version" {
  type    = string
  default = "15.5"
}

variable "database_name" {
  type    = string
  default = "cloudops"
}

variable "database_port" {
  type    = number
  default = 5432
}

variable "database_multi_az" {
  type    = bool
  default = false
}

variable "database_create_read_replica" {
  type    = bool
  default = false
}

variable "database_backup_retention_period" {
  type    = number
  default = 7
}

variable "database_deletion_protection" {
  type    = bool
  default = false
}

variable "database_skip_final_snapshot" {
  type    = bool
  default = true
}

variable "database_performance_insights_enabled" {
  type    = bool
  default = true
}

variable "database_monitoring_interval" {
  type    = number
  default = 60
}

variable "database_rotation_enabled" {
  type    = bool
  default = false
}

variable "database_rotation_lambda_arn" {
  type    = string
  default = ""
}

variable "database_rotation_lambda_auto_deploy" {
  type    = bool
  default = false
}

variable "database_rotation_days" {
  type    = number
  default = 30
}

variable "database_secret_recovery_window_days" {
  type    = number
  default = 7
}

variable "database_log_connections" {
  type    = bool
  default = true
}

variable "database_log_disconnections" {
  type    = bool
  default = true
}

variable "database_log_duration" {
  type    = bool
  default = true
}

variable "database_log_statement" {
  type    = string
  default = "all"
}

variable "database_log_min_duration_statement_ms" {
  type    = number
  default = -1
}

#── Bucket hardening (for compliance/backup buckets owned by this stack) ─────

variable "buckets_force_destroy" {
  type    = bool
  default = true
}

#── Compliance ───────────────────────────────────────────────────────────────

variable "enable_cloudtrail" {
  type    = bool
  default = false
}

variable "cloudtrail_object_lock_enabled" {
  type    = bool
  default = false
}

variable "cloudtrail_object_lock_retention_days" {
  type    = number
  default = 90
}

variable "enable_guardduty" {
  type    = bool
  default = false
}

variable "guardduty_eks_protection" {
  type    = bool
  default = true
}

variable "guardduty_s3_protection" {
  type    = bool
  default = true
}

variable "guardduty_malware_protection" {
  type    = bool
  default = false
}

variable "enable_config" {
  type    = bool
  default = false
}

variable "config_conformance_packs" {
  type = list(object({
    name            = string
    template_s3_uri = string
  }))
  default = []
}

variable "enable_security_hub" {
  type    = bool
  default = false
}

variable "security_hub_standards" {
  type    = list(string)
  default = []
}

#── Backup ───────────────────────────────────────────────────────────────────

variable "backup_vault_lock_enabled" {
  type    = bool
  default = false
}

variable "backup_vault_lock_min_retention_days" {
  type    = number
  default = 7
}

variable "backup_vault_lock_max_retention_days" {
  type    = number
  default = 365
}

variable "backup_daily_retention_days" {
  type    = number
  default = 7
}

variable "backup_weekly_retention_days" {
  type    = number
  default = 30
}

variable "backup_monthly_retention_days" {
  type    = number
  default = 365
}
