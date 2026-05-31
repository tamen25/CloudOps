variable "namespace" {
  type = string
}

variable "image" {
  description = "loadgen container image."
  type        = string
}

variable "gateway_url" {
  description = "In-cluster URL of the api-gateway the loadgen targets. The ONLY target (SSRF guard)."
  type        = string
}

variable "otel_endpoint" {
  type    = string
  default = ""
}

variable "otel_resource_attributes" {
  type    = string
  default = ""
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "replicas" {
  type    = number
  default = 1
}

#─── Trickle CronJob ──────────────────────────────────────────────────────────
variable "enable_trickle" {
  description = "Create the steady-trickle CronJob so the service map is never empty."
  type        = bool
  default     = true
}

variable "trickle_schedule" {
  description = "Cron schedule for the trickle run (default every 5 minutes)."
  type        = string
  default     = "*/5 * * * *"
}

variable "trickle_scenario" {
  type    = string
  default = "mixed"
}

variable "trickle_rps" {
  type    = number
  default = 3
}

variable "trickle_duration_seconds" {
  type    = number
  default = 60
}

variable "tags" {
  type    = map(string)
  default = {}
}
