variable "name_prefix" {
  description = "Prefix for resource names (e.g. cloudops-dev)"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS CMK ARN for encrypting backup vault contents. Empty = AWS-managed aws/backup."
  type        = string
  default     = ""
}

variable "rds_instance_arns" {
  description = "RDS instance ARNs to include in the backup plan."
  type        = list(string)
  default     = []
}

variable "ebs_volume_tag_key" {
  description = "Tag key used to select EBS volumes for backup. Volumes tagged \"Backup=true\" are included."
  type        = string
  default     = "Backup"
}

variable "ebs_volume_tag_value" {
  description = "Tag value paired with ebs_volume_tag_key to select EBS volumes."
  type        = string
  default     = "true"
}

variable "vault_lock_enabled" {
  description = "Enable AWS Backup vault lock (compliance mode). NEVER set true in test environments — locked vaults CANNOT be destroyed until min_retention_days expires."
  type        = bool
  default     = false
}

variable "vault_lock_min_retention_days" {
  description = "Minimum retention days for vault lock. Vault is undeletable until this elapses."
  type        = number
  default     = 7
}

variable "vault_lock_max_retention_days" {
  description = "Maximum retention days for vault lock."
  type        = number
  default     = 365
}

variable "daily_retention_days" {
  description = "Days to retain daily backups."
  type        = number
  default     = 7
}

variable "weekly_retention_days" {
  description = "Days to retain weekly backups."
  type        = number
  default     = 30
}

variable "monthly_retention_days" {
  description = "Days to retain monthly backups."
  type        = number
  default     = 365
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}
