variable "project_name" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "domain_name" { type = string }

variable "create_custom_domain" {
  description = "Provision assets.<domain_name> CloudFront alias + Route 53 record."
  type        = bool
  default     = false
}

variable "assets_subdomain" {
  description = "Subdomain for the CDN."
  type        = string
  default     = "assets"
}

variable "acm_certificate_arn" {
  description = "ACM cert ARN in us-east-1 (CloudFront requirement)."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the apex domain."
  type        = string
  default     = ""
}

variable "storefront_irsa_role_name" {
  description = "Storefront IRSA role name — gains s3:PutObject (presigned URL upload via admin route)."
  type        = string
  default     = ""
}

variable "sharp_layer_arn" {
  description = "Lambda layer ARN providing libvips + sharp for the resize Lambda. Empty packages sharp in the Lambda zip (heavier)."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
