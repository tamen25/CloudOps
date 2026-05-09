#This file defines variables settings for CloudOps.
#Cluster stack variables.

variable "region" {
  type    = string
  default = "us-east-1"
}

#Defines the environment input value.
variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the project name input value.
variable "project_name" {
  type = string
}

#Defines the owner input value.
variable "owner" {
  type    = string
  default = ""
}

#Defines the AWS account ID input value.
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

#Defines the codeartifact domain name input value.
variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

#Defines the codeartifact repository names input value.
variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

#Defines the codeartifact KMS key arn input value.
variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

#Defines the use remote state foundation input value.
variable "use_remote_state_foundation" {
  description = "When true, read VPC/subnet/SG IDs from foundation stack remote state. False = use existing_* vars."
  type        = bool
  default     = true
}

#Defines the foundation state bucket input value.
variable "foundation_state_bucket" {
  type    = string
  default = ""
}

#Defines the foundation state key input value.
variable "foundation_state_key" {
  type    = string
  default = ""
}

#Defines the existing VPC ID input value.
variable "existing_vpc_id" {
  type    = string
  default = ""
}

#Defines the existing private subnet ids input value.
variable "existing_private_subnet_ids" {
  type    = list(string)
  default = []
}

#Defines the existing public subnet ids input value.
variable "existing_public_subnet_ids" {
  type    = list(string)
  default = []
}

#Defines the existing node sg ID input value.
variable "existing_node_sg_id" {
  type    = string
  default = ""
}

#── EKS knobs ────────────────────────────────────────────────────────────────

variable "eks_kubernetes_version" {
  type    = string
  default = "1.32"
}

#Defines the EKS node instance types input value.
variable "eks_node_instance_types" {
  type    = list(string)
  default = ["t3.large"]
}

#Defines the EKS node min size input value.
variable "eks_node_min_size" {
  type    = number
  default = 2
}

#Defines the EKS node max size input value.
variable "eks_node_max_size" {
  type    = number
  default = 6
}

#Defines the EKS node desired size input value.
variable "eks_node_desired_size" {
  type    = number
  default = 2
}

#Defines the EKS node capacity type input value.
variable "eks_node_capacity_type" {
  type    = string
  default = "ON_DEMAND"
}

#Defines the order API namespace input value.
variable "order_api_namespace" {
  type    = string
  default = "cloudops"
}

#Defines the order API service account input value.
variable "order_api_service_account" {
  type    = string
  default = "order-api"
}

#Defines the order API API key secret arn input value.
variable "order_api_api_key_secret_arn" {
  type    = string
  default = ""
}

#Defines the EKS endpoint private access input value.
variable "eks_endpoint_private_access" {
  type    = bool
  default = true
}

#Defines the EKS endpoint public access input value.
variable "eks_endpoint_public_access" {
  type    = bool
  default = true
}

#Defines the EKS endpoint public access cidrs input value.
variable "eks_endpoint_public_access_cidrs" {
  type    = list(string)
  default = ["0.0.0.0/0"]
}
