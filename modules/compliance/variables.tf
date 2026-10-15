variable "name_prefix" {
  description = "Prefix for resource names."
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID — used for globally unique S3 bucket names."
  type        = string
}

#── CloudTrail ────────────────────────────────────────────────────────────────

variable "enable_cloudtrail" {
  description = "Deploy a multi-region CloudTrail with log file validation."
  type        = bool
  default     = false
}

variable "cloudtrail_object_lock_enabled" {
  description = "Enable S3 Object Lock on the CloudTrail bucket (compliance mode). NEVER true in test envs — locked objects cannot be deleted until retention expires."
  type        = bool
  default     = false
}

variable "cloudtrail_object_lock_retention_days" {
  description = "Object Lock retention period for CloudTrail logs."
  type        = number
  default     = 90
}

variable "cloudtrail_buckets_force_destroy" {
  description = "Allow `terraform destroy` to nuke the CloudTrail bucket. Set false in real prod."
  type        = bool
  default     = true
}

#── GuardDuty ─────────────────────────────────────────────────────────────────

variable "enable_guardduty" {
  description = "Enable GuardDuty for the account."
  type        = bool
  default     = false
}

variable "guardduty_eks_protection" {
  description = "Enable GuardDuty EKS Audit Logs + Runtime Monitoring protection plans."
  type        = bool
  default     = true
}

variable "guardduty_s3_protection" {
  description = "Enable GuardDuty S3 Protection."
  type        = bool
  default     = true
}

variable "guardduty_malware_protection" {
  description = "Enable GuardDuty Malware Protection for EBS volumes."
  type        = bool
  default     = false
}

#── AWS Config ────────────────────────────────────────────────────────────────

variable "enable_config" {
  description = "Deploy AWS Config recorder + delivery channel + conformance packs."
  type        = bool
  default     = false
}

variable "config_conformance_packs" {
  description = "Conformance pack templates to deploy. Each entry needs a name and template_s3_uri."
  type = list(object({
    name            = string
    template_s3_uri = string
  }))
  default = []
}

#── Security Hub ──────────────────────────────────────────────────────────────

variable "enable_security_hub" {
  description = "Enable Security Hub with the specified standards."
  type        = bool
  default     = false
}

variable "security_hub_standards" {
  description = "Security Hub standard ARNs to subscribe to. Common: CIS AWS Foundations Benchmark, AWS Foundational Security Best Practices, PCI-DSS."
  type        = list(string)
  default = [
    "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0",
    "arn:aws:securityhub:::standards/aws-foundational-security-best-practices/v/1.0.0",
  ]
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default     = {}
}
