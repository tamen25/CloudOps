# SLO Module Variables

variable "project_name" {
  description = "Project name used for resource naming (e.g. cloudops)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "environment must be one of: dev, staging, prod."
  }
}

variable "prometheus_url" {
  description = <<-EOT
    Base URL for Prometheus HTTP API queries (no trailing slash).
    Cluster-internal default: http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090
    For Lambda without VPC config, use the Grafana datasource proxy instead:
      https://grafana.<domain>/api/datasources/proxy/uid/prometheus
  EOT
  type        = string
}

variable "grafana_url" {
  description = "Grafana base URL (e.g. https://grafana.tamendutta.com). Used for future Grafana API calls."
  type        = string
  default     = ""
}

variable "grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN for the Grafana service account API key. Required when prometheus_url points to the Grafana datasource proxy. Leave empty if using a direct (unauthenticated) Prometheus endpoint."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags to apply to all resources in this module"
  type        = map(string)
  default     = {}
}
