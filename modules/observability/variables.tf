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
  description = "Root domain for DNS records"
  type        = string
  default     = "tamendutta.com"
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

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
