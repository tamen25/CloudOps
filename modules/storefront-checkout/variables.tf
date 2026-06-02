variable "project_name" { type = string }
variable "environment" { type = string }
variable "region" { type = string }

variable "order_api_url" {
  description = "Deprecated compatibility input retained for existing stacks; order creation now happens in the authenticated storefront route."
  type        = string
}

variable "ses_source_email" {
  description = "Verified SES identity to send order-confirmation emails from."
  type        = string
  default     = ""
}

variable "storefront_irsa_role_name" {
  description = "Name of the storefront IRSA role — granted states:StartExecution on this state machine."
  type        = string
  default     = ""
}

variable "tags" {
  type    = map(string)
  default = {}
}
