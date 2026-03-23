# EKS Module Variables

variable "name_prefix" {
  description = "Prefix for resource names (e.g., cloudops)"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# Cluster

variable "cluster_name" {
  description = "Exact EKS cluster name. Must match the value passed to the networking module for subnet tags."
  type        = string
}

variable "kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.32"
}

# Networking

variable "vpc_id" {
  description = "VPC ID where the cluster will be created"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for EKS nodes (from networking module)"
  type        = list(string)
}

variable "public_subnet_ids" {
  description = "Public subnet IDs included in cluster vpc_config for endpoint routing"
  type        = list(string)
}

variable "node_sg_id" {
  description = "Security group ID for EKS nodes (eks_nodes_sg_id from networking module)"
  type        = string
}

# Node Group

variable "node_instance_types" {
  description = "EC2 instance types for the managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "node_min_size" {
  description = "Minimum number of nodes in the node group"
  type        = number
  default     = 2
}

variable "node_max_size" {
  description = "Maximum number of nodes in the node group"
  type        = number
  default     = 6
}

variable "node_desired_size" {
  description = "Desired number of nodes in the node group"
  type        = number
  default     = 2
}

# IRSA — order-api

variable "order_api_namespace" {
  description = "Kubernetes namespace for the order-api service account"
  type        = string
  default     = "cloudops"
}

variable "order_api_service_account" {
  description = "Kubernetes service account name for order-api IRSA"
  type        = string
  default     = "order-api"
}

# Tagging

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
