#Variables for the auth module — Cognito User Pool + Hosted UI for the
#storefront (closes backlog #80).

variable "project_name" {
  description = "Project prefix for resource names."
  type        = string
}

variable "environment" {
  description = "Environment label (dev/staging/prod) — appears in resource names."
  type        = string
}

variable "domain_name" {
  description = "Apex domain. Hosted UI lives at auth.<domain_name>."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the apex domain. Required when create_hosted_ui_domain=true."
  type        = string
  default     = ""
}

variable "create_hosted_ui_domain" {
  description = "Set to true to create the custom Hosted UI domain auth.<domain_name>. Requires route53_zone_id + an ACM cert in us-east-1."
  type        = bool
  default     = false
}

variable "hosted_ui_acm_certificate_arn" {
  description = "ACM certificate ARN for auth.<domain_name>. MUST live in us-east-1 (Cognito custom domains use CloudFront under the hood)."
  type        = string
  default     = ""
}

variable "callback_urls" {
  description = "Full list of allowed OAuth callback URLs. Must include https://<domain>/auth/callback for the storefront."
  type        = list(string)
}

variable "logout_urls" {
  description = "Full list of allowed sign-out URLs."
  type        = list(string)
}

variable "password_minimum_length" {
  description = "Cognito password policy minimum length."
  type        = number
  default     = 12
}

variable "mfa_configuration" {
  description = "Cognito MFA mode: OFF / ON / OPTIONAL."
  type        = string
  default     = "OPTIONAL"
}

variable "id_token_validity_minutes" {
  description = "ID token validity window in minutes."
  type        = number
  default     = 60
}

variable "access_token_validity_minutes" {
  description = "Access token validity window in minutes."
  type        = number
  default     = 60
}

variable "refresh_token_validity_days" {
  description = "Refresh token validity window in days."
  type        = number
  default     = 30
}

variable "admin_group_name" {
  description = "Cognito group name for storefront admins (gates /admin routes)."
  type        = string
  default     = "admin"
}

variable "tags" {
  description = "Common tags applied to all resources."
  type        = map(string)
  default     = {}
}
