#Inputs for the storefront-search module (closes backlog #82).

variable "project_name" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "domain_name" { type = string }

variable "create_custom_domain" {
  description = "Provision the search.<domain_name> custom domain + ACM cert + Route 53 alias."
  type        = bool
  default     = false
}

variable "search_subdomain" {
  description = "Subdomain for the search API Gateway."
  type        = string
  default     = "search"
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN for search.<domain_name>. Same region as the API GW."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the apex domain."
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID used by the JWT authorizer (from module.auth)."
  type        = string
}

variable "cognito_client_id" {
  description = "Storefront Cognito app client ID — the JWT audience."
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for the VPC link. From the networking stack."
  type        = list(string)
}

variable "vpc_link_security_group_ids" {
  description = "Security group IDs for the VPC Link ENIs."
  type        = list(string)
}

variable "order_api_internal_url" {
  description = "Internal URL the Lambda calls to reach Express _internal/search (e.g. http://order-api.cloudops.svc.cluster.local:3000)."
  type        = string
}

variable "hmac_secret_parameter_name" {
  description = "SSM Parameter Store name holding the shared HMAC secret (SecureString)."
  type        = string
  default     = ""
}

variable "lambda_memory_mb" {
  description = "Lambda memory size."
  type        = number
  default     = 256
}

variable "lambda_timeout_seconds" {
  description = "Lambda timeout."
  type        = number
  default     = 5
}

variable "otel_endpoint" {
  description = "OTel collector endpoint for the Lambda (OTEL_EXPORTER_OTLP_ENDPOINT)."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}
