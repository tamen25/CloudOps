#This file defines variables settings for CloudOps.
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

#Defines the environment input value.
variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the project name input value.
variable "project_name" {
  type = string
}

#Defines the owner input value.
variable "owner" {
  type    = string
  default = ""
}

#Defines the domain name input value.
variable "domain_name" {
  type = string
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  type    = string
  default = ""
}

#Defines the destroy all input value.
variable "destroy_all" {
  type    = bool
  default = false
}

#── Module toggles ───────────────────────────────────────────────────────────

variable "enable_networking" {
  type    = bool
  default = false
}

#Defines the enable database input value.
variable "enable_database" {
  type    = bool
  default = false
}

#Defines the enable compliance input value.
variable "enable_compliance" {
  type    = bool
  default = false
}

#Defines the enable backup input value.
variable "enable_backup" {
  type    = bool
  default = false
}

#Defines the enable codeartifact input value.
variable "enable_codeartifact" {
  type    = bool
  default = false
}

#── Bootstrap ────────────────────────────────────────────────────────────────

variable "bootstrap_bucket_name" {
  type    = string
  default = ""
}

#Defines the bootstrap create KMS input value.
variable "bootstrap_create_kms" {
  type    = bool
  default = true
}

#Defines the bootstrap KMS deletion window input value.
variable "bootstrap_kms_deletion_window" {
  type    = number
  default = 30
}

#Defines the bootstrap additional trusted arns input value.
variable "bootstrap_additional_trusted_arns" {
  type    = list(string)
  default = []
}

#Defines the bootstrap require mfa input value.
variable "bootstrap_require_mfa" {
  type    = bool
  default = false
}

#Defines the bootstrap external ID input value.
variable "bootstrap_external_id" {
  type    = string
  default = ""
}

#Defines the bootstrap max session duration input value.
variable "bootstrap_max_session_duration" {
  type    = number
  default = 3600
}

#Defines the bootstrap additional policy arns input value.
variable "bootstrap_additional_policy_arns" {
  type    = list(string)
  default = []
}

#Defines the github token input value.
variable "github_token" {
  type      = string
  sensitive = true
  default   = ""
}

#Defines the security github repo input value.
variable "security_github_repo" {
  type    = string
  default = ""
}

#── CodeArtifact ────────────────────────────────────────────────────────────

variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

#Defines the codeartifact repository names input value.
variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

#Defines the codeartifact KMS key arn input value.
variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

#── Networking ───────────────────────────────────────────────────────────────

variable "az_count" {
  type    = number
  default = 2
}

#Defines the VPC cidr input value.
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

#Defines the public subnet cidrs input value.
variable "public_subnet_cidrs" {
  type    = list(string)
  default = null
}

#Defines the private subnet cidrs input value.
variable "private_subnet_cidrs" {
  type    = list(string)
  default = null
}

#Defines the database subnet cidrs input value.
variable "db_subnet_cidrs" {
  type    = list(string)
  default = null
}

#Defines the enable nat gateway input value.
variable "enable_nat_gateway" {
  type    = bool
  default = true
}

#Defines the enable flow logs input value.
variable "enable_flow_logs" {
  type    = bool
  default = false
}

#Defines the flow logs destination input value.
variable "flow_logs_destination" {
  type    = string
  default = "cloudwatch"
}

#Defines the flow logs retention days input value.
variable "flow_logs_retention_days" {
  type    = number
  default = 7
}

#Defines the allowed cidr blocks input value.
variable "allowed_cidr_blocks" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}

#Defines the enable HTTPS input value.
variable "enable_https" {
  type    = bool
  default = true
}

#Defines the enable HTTP input value.
variable "enable_http" {
  type    = bool
  default = true
}

#Defines the custom alb ports input value.
variable "custom_alb_ports" {
  type    = list(number)
  default = []
}

#Defines the RDS port input value.
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

#Defines the database allocated storage input value.
variable "database_allocated_storage" {
  type    = number
  default = 20
}

#Defines the database max allocated storage input value.
variable "database_max_allocated_storage" {
  type    = number
  default = 100
}

#Defines the database engine input value.
variable "database_engine" {
  type    = string
  default = "postgres"
}

#Defines the database engine version input value.
variable "database_engine_version" {
  type    = string
  default = "15.5"
}

#Defines the database name input value.
variable "database_name" {
  type    = string
  default = "cloudops"
}

#Defines the database port input value.
variable "database_port" {
  type    = number
  default = 5432
}

#Defines the database multi az input value.
variable "database_multi_az" {
  type    = bool
  default = false
}

#Defines the database create read replica input value.
variable "database_create_read_replica" {
  type    = bool
  default = false
}

#Defines the database backup retention period input value.
variable "database_backup_retention_period" {
  type    = number
  default = 7
}

#Defines the database deletion protection input value.
variable "database_deletion_protection" {
  type    = bool
  default = false
}

#Defines the database skip final snapshot input value.
variable "database_skip_final_snapshot" {
  type    = bool
  default = true
}

#Defines the database performance insights enabled input value.
variable "database_performance_insights_enabled" {
  type    = bool
  default = true
}

#Defines the database monitoring interval input value.
variable "database_monitoring_interval" {
  type    = number
  default = 60
}

#Defines the database rotation enabled input value.
variable "database_rotation_enabled" {
  type    = bool
  default = false
}

#Defines the database rotation lambda arn input value.
variable "database_rotation_lambda_arn" {
  type    = string
  default = ""
}

#Defines the database rotation lambda auto deploy input value.
variable "database_rotation_lambda_auto_deploy" {
  type    = bool
  default = false
}

#Defines the database rotation days input value.
variable "database_rotation_days" {
  type    = number
  default = 30
}

#Defines the database secret recovery window days input value.
variable "database_secret_recovery_window_days" {
  type    = number
  default = 7
}

#Defines the database log connections input value.
variable "database_log_connections" {
  type    = bool
  default = true
}

#Defines the database log disconnections input value.
variable "database_log_disconnections" {
  type    = bool
  default = true
}

#Defines the database log duration input value.
variable "database_log_duration" {
  type    = bool
  default = true
}

#Defines the database log statement input value.
variable "database_log_statement" {
  type    = string
  default = "all"
}

#Defines the database log min duration statement ms input value.
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

#Defines the cloudtrail object lock enabled input value.
variable "cloudtrail_object_lock_enabled" {
  type    = bool
  default = false
}

#Defines the cloudtrail object lock retention days input value.
variable "cloudtrail_object_lock_retention_days" {
  type    = number
  default = 90
}

#Defines the enable guardduty input value.
variable "enable_guardduty" {
  type    = bool
  default = false
}

#Defines the guardduty EKS protection input value.
variable "guardduty_eks_protection" {
  type    = bool
  default = true
}

#Defines the guardduty s3 protection input value.
variable "guardduty_s3_protection" {
  type    = bool
  default = true
}

#Defines the guardduty malware protection input value.
variable "guardduty_malware_protection" {
  type    = bool
  default = false
}

#Defines the enable config input value.
variable "enable_config" {
  type    = bool
  default = false
}

#Defines the config conformance packs input value.
variable "config_conformance_packs" {
  type = list(object({
    name            = string
    template_s3_uri = string
  }))
  default = []
}

#Defines the enable security hub input value.
variable "enable_security_hub" {
  type    = bool
  default = false
}

#Defines the security hub standards input value.
variable "security_hub_standards" {
  type    = list(string)
  default = []
}

#── Backup ───────────────────────────────────────────────────────────────────

variable "backup_vault_lock_enabled" {
  type    = bool
  default = false
}

#Defines the backup vault lock min retention days input value.
variable "backup_vault_lock_min_retention_days" {
  type    = number
  default = 7
}

#Defines the backup vault lock max retention days input value.
variable "backup_vault_lock_max_retention_days" {
  type    = number
  default = 365
}

#Defines the backup daily retention days input value.
variable "backup_daily_retention_days" {
  type    = number
  default = 7
}

#Defines the backup weekly retention days input value.
variable "backup_weekly_retention_days" {
  type    = number
  default = 30
}

#Defines the backup monthly retention days input value.
variable "backup_monthly_retention_days" {
  type    = number
  default = 365
}
