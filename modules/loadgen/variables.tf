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

#─── Chaos pod-kill (#143) ────────────────────────────────────────────────────
variable "enable_chaos" {
  description = <<-EOT
    Grant the loadgen control SA a namespace-scoped Role to get/list/delete pods
    so the chaos scenario can kill ONE live mesh pod and let self-healing
    reschedule it. OFF by default — when false, no RBAC is created and the
    loadgen's POST /chaos/kill returns 404 (the env flag CHAOS_ENABLED is also
    not set). The app re-checks the target against a fixed mesh allowlist and
    defaults to dry-run, so this permission alone cannot kill loadgen itself or
    any infra pod.
  EOT
  type        = bool
  default     = false
}
