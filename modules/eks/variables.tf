#This file defines variables settings for CloudOps.
#EKS Module Variables

variable "name_prefix" {
  description = "Prefix for resource names (e.g., cloudops)"
  type        = string
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Cluster

variable "cluster_name" {
  description = "Exact EKS cluster name. Must match the value passed to the networking module for subnet tags."
  type        = string
}

#Defines the kubernetes version input value.
variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.32"
}

#Networking

variable "private_subnet_ids" {
  description = "Private subnet IDs for EKS nodes (from networking module)"
  type        = list(string)
}

#Defines the public subnet ids input value.
variable "public_subnet_ids" {
  description = "Public subnet IDs included in cluster vpc_config for endpoint routing"
  type        = list(string)
}

#Defines the node sg ID input value.
variable "node_sg_id" {
  description = "Security group ID for EKS nodes (eks_nodes_sg_id from networking module)"
  type        = string
}

#Node Group

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

#Defines the node min size input value.
variable "node_min_size" {
  description = "Minimum number of nodes in the node group"
  type        = number
  default     = 2
}

#Defines the node max size input value.
variable "node_max_size" {
  description = "Maximum number of nodes in the node group"
  type        = number
  default     = 6
}

#Defines the node desired size input value.
variable "node_desired_size" {
  description = "Desired number of nodes in the node group"
  type        = number
  default     = 2
}

#Defines the node capacity type input value.
variable "node_capacity_type" {
  description = "EKS managed node group capacity type — ON_DEMAND or SPOT. SPOT can cut node cost 40-70% for stateless dev workloads but nodes can be interrupted with a 2-minute warning."
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = contains(["ON_DEMAND", "SPOT"], var.node_capacity_type)
    error_message = "node_capacity_type must be ON_DEMAND or SPOT."
  }
}

#IRSA — order-api

variable "order_api_namespace" {
  description = "Kubernetes namespace for the order-api service account"
  type        = string
  default     = "cloudops"
}

#Defines the order API service account input value.
variable "order_api_service_account" {
  description = "Kubernetes service account name for order-api IRSA"
  type        = string
  default     = "order-api"
}

#Defines the order API secret arns input value.
variable "order_api_secret_arns" {
  description = "Secrets Manager ARNs (or ARN wildcards) the order-api IRSA may read. Empty list falls back to the legacy `Resource = \"*\"` policy — only use during initial bootstrap."
  type        = list(string)
  default     = []
}

#── Control-plane endpoint exposure (closes backlog #42) ─────────────────────

variable "endpoint_private_access" {
  description = "Enable EKS control plane access from inside the VPC."
  type        = bool
  default     = true
}

#Defines the endpoint public access input value.
variable "endpoint_public_access" {
  description = "Enable EKS control plane access from the internet. Production should set this `false` and reach the cluster via private runners / VPN / bastion. Keep `true` only when GitHub-hosted runners with dynamic IPs need direct access."
  type        = bool
  default     = true
}

#Defines the endpoint public access cidrs input value.
variable "endpoint_public_access_cidrs" {
  description = "CIDR blocks allowed to reach the public EKS endpoint. Defaults to `0.0.0.0/0` for the dev flow with GitHub-hosted runners. Production: tighten to admin/VPN egress IPs and document the emergency-access path."
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition = alltrue([
      for cidr in var.endpoint_public_access_cidrs : can(cidrhost(cidr, 0))
    ])
    error_message = "All endpoint_public_access_cidrs entries must be valid IPv4 CIDR blocks."
  }
}

#── EKS secrets encryption (closes backlog #111) ─────────────────────────────

#Defines the enable secrets encryption input value.
variable "enable_secrets_encryption" {
  description = "Encrypt Kubernetes secrets at rest with a dedicated CMK. Recommended for staging/prod. `null` (default) auto-enables for non-dev environments; set explicitly to `true`/`false` to override."
  type        = bool
  default     = null
}

#Tagging

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}
