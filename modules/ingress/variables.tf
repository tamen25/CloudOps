#This file defines variables settings for CloudOps.
variable "name_prefix" {
  description = "Prefix for resource names"
  type        = string
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

#Defines the cluster name input value.
variable "cluster_name" {
  description = "EKS cluster name"
  type        = string
}

#Defines the region input value.
variable "region" {
  description = "AWS region"
  type        = string
}

#Defines the VPC ID input value.
variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

#Defines the OIDC provider arn input value.
variable "oidc_provider_arn" {
  description = "OIDC provider ARN from the EKS module"
  type        = string
}

#Defines the OIDC provider URL input value.
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

#Defines the alb zone ID input value.
variable "alb_zone_id" {
  description = "ALB hosted zone ID (used for Route 53 alias records)"
  type        = string
  default     = ""
}

#Defines the zone ID input value.
variable "zone_id" {
  description = "Route53 hosted zone ID for the domain (from dns module)"
  type        = string
}

#Defines the domain name input value.
variable "domain_name" {
  description = "Root domain for ACM wildcard cert and Route 53 records (e.g. example.com)"
  type        = string
}

#Defines the API subdomain input value.
variable "api_subdomain" {
  description = "Subdomain for the application API"
  type        = string
  default     = "api"
}

#Defines the grafana subdomain input value.
variable "grafana_subdomain" {
  description = "Subdomain for the Grafana UI"
  type        = string
  default     = "grafana"
}

#Defines the OTel subdomain input value.
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

#Defines the OTel alb zone ID input value.
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

#Defines the WAF rate limit per 5min input value.
variable "waf_rate_limit_per_5min" {
  description = "Per-IP rate limit (requests per 5 minutes). 2000 is the AWS-recommended default."
  type        = number
  default     = 2000
}

#Defines the WAF geo block countries input value.
variable "waf_geo_block_countries" {
  description = "ISO 3166-1 alpha-2 country codes to block. Empty = no geo block."
  type        = list(string)
  default     = []
}

#Defines the WAF logging enabled input value.
variable "waf_logging_enabled" {
  description = "Send sampled WAF blocked-request logs to CloudWatch."
  type        = bool
  default     = true
}

#Defines the tags input value.
variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
