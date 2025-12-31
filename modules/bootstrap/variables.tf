# CloudOps Bootstrap Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "owner" {
  description = "Owner or team responsible for infrastructure"
  type        = string
}

variable "bucket_name" {
  description = "S3 bucket name (auto-generated if empty)"
  type        = string
  default     = ""
}

variable "create_kms" {
  description = "Create KMS key for state encryption"
  type        = bool
  default     = true
}

variable "kms_deletion_window" {
  description = "KMS key deletion window in days (7-30)"
  type        = number
  default     = 30
}

variable "additional_trusted_arns" {
  description = "Additional IAM ARNs that can assume deployer role"
  type        = list(string)
  default     = []
}

variable "require_mfa" {
  description = "Require MFA for deployer role"
  type        = bool
  default     = false
}

variable "external_id" {
  description = "External ID for cross-account access"
  type        = string
  default     = ""
}

variable "max_session_duration" {
  description = "Maximum session duration in seconds (3600-43200)"
  type        = number
  default     = 3600
}

variable "additional_policy_arns" {
  description = "Additional IAM policy ARNs for deployer role"
  type        = list(string)
  default     = []
}
