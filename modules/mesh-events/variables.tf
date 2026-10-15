variable "project_name" {
  type = string
}

variable "environment" {
  type = string
}

variable "kinesis_stream_arn" {
  description = "ARN of the order-event Kinesis stream the enrichment Lambda consumes. Empty disables the event-source mapping."
  type        = string
  default     = ""
}

variable "metric_namespace" {
  description = "CloudWatch namespace the analytics Lambda emits EMF metrics under."
  type        = string
  default     = "CloudOps/Mesh"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for the Lambda log groups."
  type        = number
  default     = 14
}

variable "tags" {
  type    = map(string)
  default = {}
}
