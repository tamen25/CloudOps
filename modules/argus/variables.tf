variable "chart" {
  description = "Path to the Argus Helm chart: deploy/helm/argus in an Argus checkout (chart 0.3.0 or later, without the bundled Postgres)"
  type        = string

  validation {
    condition     = length(trimspace(var.chart)) > 0
    error_message = "Set chart to the deploy/helm/argus directory of an Argus checkout."
  }
}

variable "namespace" {
  description = "Namespace the engine runs in"
  type        = string
  default     = "argus"
}

variable "image_tag" {
  description = "Engine image tag (ghcr.io/tamen25/argus); empty uses the chart's appVersion"
  type        = string
  default     = ""
}

variable "monitoring_namespace" {
  description = "Namespace of the OTel Collector, Prometheus and Grafana: the only callers the engine's NetworkPolicy admits"
  type        = string
  default     = "monitoring"
}

variable "prometheus_release" {
  description = "kube-prometheus-stack release name; its Prometheus selects ServiceMonitors labelled release=<this>"
  type        = string
  default     = "prometheus"
}
