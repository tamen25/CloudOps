#This file defines variables settings for CloudOps.
variable "name_prefix" {
  description = "Prefix for resource names (e.g. cloudops-dev)"
  type        = string
}

#Defines the KMS key arn input value.
variable "kms_key_arn" {
  description = "KMS CMK ARN for encrypting backup vault contents. Empty = AWS-managed aws/backup."
  type        = string
  default     = ""
}

#Defines the RDS instance arns input value.
variable "rds_instance_arns" {
  description = "RDS instance ARNs to include in the backup plan."
  type        = list(string)
  default     = []
}

#Defines the ebs volume tag key input value.
variable "ebs_volume_tag_key" {
  description = "Tag key used to select EBS volumes for backup. Volumes tagged \"Backup=true\" are included."
  type        = string
  default     = "Backup"
}

#Defines the ebs volume tag value input value.
variable "ebs_volume_tag_value" {
  description = "Tag value paired with ebs_volume_tag_key to select EBS volumes."
  type        = string
  default     = "true"
}

#Defines the vault lock enabled input value.
variable "vault_lock_enabled" {
  description = "Enable AWS Backup vault lock (compliance mode). NEVER set true in test environments — locked vaults CANNOT be destroyed until min_retention_days expires."
  type        = bool
  default     = false
}

#Defines the vault lock min retention days input value.
variable "vault_lock_min_retention_days" {
  description = "Minimum retention days for vault lock. Vault is undeletable until this elapses."
  type        = number
  default     = 7
}

#Defines the vault lock max retention days input value.
variable "vault_lock_max_retention_days" {
  description = "Maximum retention days for vault lock."
  type        = number
  default     = 365
}

#Defines the daily retention days input value.
variable "daily_retention_days" {
  description = "Days to retain daily backups."
  type        = number
  default     = 7
}

#Defines the weekly retention days input value.
variable "weekly_retention_days" {
  description = "Days to retain weekly backups."
  type        = number
  default     = 30
}

#Defines the monthly retention days input value.
variable "monthly_retention_days" {
  description = "Days to retain monthly backups."
  type        = number
  default     = 365
}

#Defines the tags input value.
variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}
