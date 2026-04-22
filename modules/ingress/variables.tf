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

# ALB alias targets — empty on first deploy, populated after the Load Balancer Controller
# creates the ALB in response to an Ingress resource being applied to the cluster.
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

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
