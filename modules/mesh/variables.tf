#Variables for the generic mesh-service module. One instance == one
#single-purpose polyglot service (Deployment + Service + SA + optional HPA +
#NetworkPolicy). Defaults are tuned for the dev/test, torn-down-nightly tier:
#1 replica, tiny requests/limits, HPA off.

variable "name" {
  description = "Service name. Used for the Deployment/Service/SA and the app label."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,40}$", var.name))
    error_message = "name must be a DNS-1123 label (lowercase alphanumeric + hyphen)."
  }
}

variable "namespace" {
  description = "Kubernetes namespace the service is deployed into."
  type        = string
}

variable "lang" {
  description = "Implementation language, recorded as the mesh.cloudops/lang label (node|go|python|java)."
  type        = string
  default     = "node"
}

variable "image" {
  description = "Fully-qualified container image (must resolve through the ECR pull-through cache for public bases)."
  type        = string
}

variable "container_port" {
  description = "Port the service listens on inside the container."
  type        = number
  default     = 8080
}

variable "replicas" {
  description = "Replica count (dev default 1)."
  type        = number
  default     = 1
}

variable "cpu_request" {
  type    = string
  default = "25m"
}

variable "memory_request" {
  type    = string
  default = "32Mi"
}

variable "cpu_limit" {
  type    = string
  default = "100m"
}

variable "memory_limit" {
  type    = string
  default = "64Mi"
}

variable "run_as_user" {
  description = "Numeric UID the container runs as (non-root). 1001 for node images, 65532 for distroless."
  type        = number
  default     = 65532
}

variable "needs_tmp_volume" {
  description = "Mount a writable /tmp emptyDir. Node images (pino/AWS SDK scratch) need it; static Go distroless does not."
  type        = bool
  default     = false
}

variable "env" {
  description = "Plain environment variables injected into the container."
  type        = map(string)
  default     = {}
}

variable "otel_endpoint" {
  description = "OTLP endpoint. Empty disables the OTel SDK in each service (no exporter retry storms)."
  type        = string
  default     = ""
}

variable "otel_resource_attributes" {
  description = "Value for OTEL_RESOURCE_ATTRIBUTES (e.g. deployment.environment=dev)."
  type        = string
  default     = ""
}

variable "otel_auth_secret_name" {
  description = "Kubernetes Secret holding the OTLP bearer token under key 'api-key'. Mounted optionally."
  type        = string
  default     = "otel-auth"
}

variable "irsa_role_arn" {
  description = "Optional IAM role ARN for IRSA. When set, annotates the ServiceAccount."
  type        = string
  default     = ""
}

variable "enable_hpa" {
  description = "Create a HorizontalPodAutoscaler. Off in dev to keep cost flat."
  type        = bool
  default     = false
}

variable "hpa_min" {
  type    = number
  default = 1
}

variable "hpa_max" {
  type    = number
  default = 3
}

variable "hpa_cpu_target" {
  description = "Target average CPU utilization percent for the HPA."
  type        = number
  default     = 70
}

variable "ingress_from_labels" {
  description = "Pod selector labels allowed to call this service (NetworkPolicy ingress). Empty = allow all in-namespace."
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags merged into resource labels where supported."
  type        = map(string)
  default     = {}
}
