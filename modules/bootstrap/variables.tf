#This file defines variables settings for CloudOps.
#CloudOps Bootstrap Module - Variables

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

#Defines the project name input value.
variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

#Defines the owner input value.
variable "owner" {
  description = "Owner or team responsible for infrastructure"
  type        = string
}

#Defines the bucket name input value.
variable "bucket_name" {
  description = "S3 bucket name (auto-generated if empty)"
  type        = string
  default     = ""
}

#Defines the create KMS input value.
variable "create_kms" {
  description = "Create KMS key for state encryption"
  type        = bool
  default     = true
}

#Defines the KMS deletion window input value.
variable "kms_deletion_window" {
  description = "KMS key deletion window in days (7-30)"
  type        = number
  default     = 30
}

#Defines the additional trusted arns input value.
variable "additional_trusted_arns" {
  description = "Additional IAM ARNs that can assume deployer role"
  type        = list(string)
  default     = []
}

#Defines the require mfa input value.
variable "require_mfa" {
  description = "Require MFA for deployer role"
  type        = bool
  default     = false
}

#Defines the external ID input value.
variable "external_id" {
  description = "External ID for cross-account access"
  type        = string
  default     = ""
}

#Defines the max session duration input value.
variable "max_session_duration" {
  description = "Maximum session duration in seconds (3600-43200)"
  type        = number
  default     = 3600
}

#Defines the additional policy arns input value.
variable "additional_policy_arns" {
  description = "Additional IAM policy ARNs for deployer role"
  type        = list(string)
  default     = []
}

#Defines the github repo input value.
variable "github_repo" {
  description = "GitHub repository in owner/name format used to scope the OIDC trust policy"
  type        = string
}

#Defines the tags input value.
variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
