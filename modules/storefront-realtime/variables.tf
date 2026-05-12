variable "project_name" { type = string }
variable "environment" { type = string }
variable "region" { type = string }
variable "domain_name" { type = string }

variable "create_custom_domain" {
  description = "Provision ws.<domain_name> custom domain + Route 53 alias."
  type        = bool
  default     = false
}

variable "ws_subdomain" {
  description = "Subdomain for the WebSocket API."
  type        = string
  default     = "ws"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN for ws.<domain_name>. Same region as the API."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the apex domain."
  type        = string
  default     = ""
}

variable "cognito_issuer_url" {
  description = "Cognito issuer URL — Lambda authorizer verifies the JWT against this."
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito app client ID — JWT audience."
  type        = string
}

variable "kinesis_stream_arn" {
  description = "Kinesis stream ARN — fanout Lambda is subscribed via event source mapping."
  type        = string
}

variable "fanout_dlq_arn" {
  description = "Optional SQS DLQ ARN for fanout failures. Empty disables DLQ."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
