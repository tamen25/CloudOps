variable "namespace" {
  description = "Namespace Chaos Mesh is installed in"
  type        = string
  default     = "chaos-mesh"
}

variable "chart_version" {
  description = "Chaos Mesh Helm chart version"
  type        = string
  default     = "2.8.4"
}

variable "target_namespaces" {
  description = "The only namespaces experiments may act in"
  type        = list(string)

  validation {
    condition     = length(var.target_namespaces) > 0 && alltrue([for n in var.target_namespaces : !contains(["kube-system", "gatekeeper-system", "falco", "chaos-mesh"], n)])
    error_message = "List at least one target namespace, and none of kube-system, gatekeeper-system, falco or chaos-mesh."
  }
}
