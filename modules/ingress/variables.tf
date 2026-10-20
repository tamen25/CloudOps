variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "oidc_provider_arn" {
  description = "OIDC provider ARN from the EKS module"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// (from EKS module)"
  type        = string
}

#ALB alias targets — empty on first deploy, populated after the Load Balancer Controller
#creates the ALB in response to an Ingress resource being applied to the cluster.
variable "alb_dns_name" {
  description = "ALB DNS name created by the Load Balancer Controller"
  type        = string
  default     = ""
}

variable "alb_zone_id" {
  description = "ALB hosted zone ID (used for Route 53 alias records)"
  type        = string
  default     = ""
}

variable "zone_id" {
  description = "Route53 hosted zone ID for the domain (from dns module)"
  type        = string
}

variable "domain_name" {
  description = "Root domain for ACM wildcard cert and Route 53 records (e.g. example.com)"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the application API"
  type        = string
  default     = "api"
}

variable "grafana_subdomain" {
  description = "Subdomain for the Grafana UI"
  type        = string
  default     = "grafana"
}

variable "otel_subdomain" {
  description = "Subdomain for the OTel Collector ingestion endpoint. Closes backlog #17."
  type        = string
  default     = "otel"
}

#OTel ALB alias — populated after the LBC creates the cloudops-otel ALB on a
#second pass. Empty on first deploy (skips the DNS record + WAF association).
variable "otel_alb_dns_name" {
  description = "ALB DNS name for the cloudops-otel group (separate ALB for gRPC ingestion)"
  type        = string
  default     = ""
}

variable "otel_alb_zone_id" {
  description = "ALB hosted zone ID for the cloudops-otel ALB (used for the otel.<domain> Route 53 alias)"
  type        = string
  default     = ""
}

#── WAFv2 ──────────────────────────────────────────────────────────────────────

variable "enable_waf" {
  description = "Attach a regional WAFv2 web ACL to the public ALB."
  type        = bool
  default     = false
}

variable "waf_rate_limit_per_5min" {
  description = "Per-IP rate limit (requests per 5 minutes). 2000 is the AWS-recommended default."
  type        = number
  default     = 2000
}

variable "waf_geo_block_countries" {
  description = "ISO 3166-1 alpha-2 country codes to block. Empty = no geo block."
  type        = list(string)
  default     = []
}

variable "waf_logging_enabled" {
  description = "Send sampled WAF blocked-request logs to CloudWatch."
  type        = bool
  default     = true
}

#Closes backlog #102. CloudWatch log retention for the WAF log group.
#Compliance regimes typically require 90 days (PCI), 1 year (SOC 2), or
#7 years (HIPAA / financial). Default of 30 days is dev-only.
#Valid CloudWatch values: 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365,
#400, 545, 731, 1827, 2192, 2557, 2922, 3288, 3653, or 0 (never expire).
variable "waf_log_retention_days" {
  description = "WAF CloudWatch log retention in days. 30 = dev, 90 = staging, 365 = prod (typical)."
  type        = number
  default     = 30
  validation {
    condition     = contains([0, 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 2192, 2557, 2922, 3288, 3653], var.waf_log_retention_days)
    error_message = "waf_log_retention_days must be a valid CloudWatch retention value (e.g. 30, 90, 365, 0=never expire)."
  }
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}

variable "storefront_subdomain" {
  description = "Subdomain the storefront is served on (<subdomain>.<domain_name>), on the shared ALB"
  type        = string
  default     = "shop"
}
