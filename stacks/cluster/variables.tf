#Cluster stack variables.

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  type = string
}

variable "owner" {
  type    = string
  default = ""
}

variable "aws_account_id" {
  type    = string
  default = ""
}

#Toggle exists for parity with foundation; cluster apply is meaningful only
#when this is true. Kept for tfvars compatibility — destroy via -destroy.
#tflint-ignore: terraform_unused_declarations
variable "enable_eks" {
  type    = bool
  default = true
}

#Bring-your-own networking (used when foundation stack is not the source —
#legacy migration only). The standard path reads from foundation outputs.
variable "enable_codeartifact" {
  type    = bool
  default = false
}

variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

variable "use_remote_state_foundation" {
  description = "When true, read VPC/subnet/SG IDs from foundation stack remote state. False = use existing_* vars."
  type        = bool
  default     = true
}

variable "foundation_state_bucket" {
  type    = string
  default = ""
}

variable "foundation_state_key" {
  type    = string
  default = ""
}

variable "existing_vpc_id" {
  type    = string
  default = ""
}

variable "existing_private_subnet_ids" {
  type    = list(string)
  default = []
}

variable "existing_public_subnet_ids" {
  type    = list(string)
  default = []
}

variable "existing_node_sg_id" {
  type    = string
  default = ""
}

#── EKS knobs ────────────────────────────────────────────────────────────────

variable "eks_kubernetes_version" {
  type    = string
  default = "1.32"
}

variable "eks_node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

variable "eks_node_min_size" {
  type    = number
  default = 2
}

variable "eks_node_max_size" {
  type    = number
  default = 6
}

variable "eks_node_desired_size" {
  type    = number
  default = 2
}

variable "eks_node_capacity_type" {
  type    = string
  default = "ON_DEMAND"
}

variable "order_api_namespace" {
  type    = string
  default = "cloudops"
}

variable "order_api_service_account" {
  type    = string
  default = "order-api"
}

variable "order_api_api_key_secret_arn" {
  type    = string
  default = ""
}

variable "eks_endpoint_private_access" {
  type    = bool
  default = true
}

variable "eks_endpoint_public_access" {
  type    = bool
  default = true
}

variable "eks_endpoint_public_access_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
