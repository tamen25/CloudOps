# Observability Module Variables

variable "name_prefix" {
  description = "Prefix for resource names (e.g., cloudops)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID used for globally unique S3 bucket names"
  type        = string
}

variable "eks_cluster_name" {
  description = "EKS cluster name — added as a resource attribute to all OTel telemetry"
  type        = string
}

variable "oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA trust policies (from eks module)"
  type        = string
}

variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// (from eks module output oidc_provider_url)"
  type        = string
}

variable "acm_cert_arn" {
  description = "ACM wildcard certificate ARN for HTTPS ingresses (from ingress module)"
  type        = string
}

variable "domain" {
  description = "Root domain for DNS records (e.g. example.com)"
  type        = string
}

variable "alb_dns_name" {
  description = "ALB DNS name for Route 53 alias records — set after first deploy"
  type        = string
  default     = ""
}

variable "alb_zone_id" {
  description = "ALB hosted zone ID for Route 53 alias records — set after first deploy"
  type        = string
  default     = ""
}

variable "zone_id" {
  description = "Route53 hosted zone ID for the domain (from dns module)"
  type        = string
  default     = ""
}

variable "application_namespace" {
  description = "Kubernetes namespace where application workloads run"
  type        = string
  default     = "cloudops"
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

# ─── SLO Targets ─────────────────────────────────────────────────────────────

variable "slo_availability_target" {
  description = "Availability SLO target as a decimal (e.g. 0.999 = 99.9%). Used in PrometheusRule burn-rate expressions and error budget calculations."
  type        = number
  default     = 0.999

  validation {
    condition     = var.slo_availability_target > 0 && var.slo_availability_target < 1
    error_message = "slo_availability_target must be a decimal between 0 and 1 (e.g. 0.999 for 99.9%)."
  }
}

variable "slo_latency_target" {
  description = "Latency SLO target as a decimal — proportion of requests that must complete in <300ms (e.g. 0.95 = 95%). Used in PrometheusRule burn-rate expressions and error budget calculations."
  type        = number
  default     = 0.95

  validation {
    condition     = var.slo_latency_target > 0 && var.slo_latency_target < 1
    error_message = "slo_latency_target must be a decimal between 0 and 1 (e.g. 0.95 for 95%)."
  }
}
