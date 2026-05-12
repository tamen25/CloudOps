variable "project_name" { type = string }
variable "environment" { type = string }

variable "retention_hours" {
  description = "Stream retention in hours. AWS minimum 24, maximum 8760."
  type        = number
  default     = 24
}

variable "kms_key_arn" {
  description = "KMS CMK ARN for stream encryption. Empty uses AWS-managed alias/aws/kinesis."
  type        = string
  default     = ""
}

variable "order_api_irsa_role_name" {
  description = "Name (not ARN) of the order-api IRSA role — the publisher policy is attached here."
  type        = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
