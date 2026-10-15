variable "project_name" { type = string }
variable "environment" { type = string }
variable "oidc_provider_arn" {
  description = "EKS OIDC provider ARN — used for IRSA trust."
  type        = string
}
variable "oidc_provider_url" {
  description = "EKS OIDC provider URL (with leading https://)."
  type        = string
}
variable "service_account_namespace" {
  description = "Kubernetes namespace of the storefront ServiceAccount."
  type        = string
  default     = "storefront"
}
variable "service_account_name" {
  description = "Kubernetes ServiceAccount name."
  type        = string
  default     = "storefront"
}
variable "tags" {
  type    = map(string)
  default = {}
}
