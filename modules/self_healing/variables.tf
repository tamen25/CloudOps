#This file defines variables settings for CloudOps.
variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

#Defines the region input value.
variable "region" {
  description = "AWS region"
  type        = string
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  default     = ""
}

#Defines the EKS cluster name input value.
variable "eks_cluster_name" {
  description = "EKS cluster name — required for Kubernetes API calls and node group scaling"
  type        = string
  default     = ""
}

#Defines the RDS instance ID input value.
variable "rds_instance_id" {
  description = "RDS instance identifier — required for RDS alarms and remediation. Leave empty to skip RDS alarms."
  type        = string
  default     = ""
}

#Defines the alb arn suffix input value.
variable "alb_arn_suffix" {
  description = "ALB ARN suffix (last two path segments of the ARN) for CloudWatch ALB metrics. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

#Defines the target group arn suffix input value.
variable "target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch ALB target metrics. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

#Defines the min healthy pods input value.
variable "min_healthy_pods" {
  description = "Minimum number of healthy order-api pods — triggers scale-out healing when current count drops below this"
  type        = number
  default     = 2
}

#Defines the max scale out pods input value.
variable "max_scale_out_pods" {
  description = "Maximum pods the self-healing controller is allowed to scale out to in a single healing action"
  type        = number
  default     = 10
}

#Defines the rollback on error rate input value.
variable "rollback_on_error_rate" {
  description = "5xx error rate percentage threshold (0-100) that triggers an automatic rollback of order-api"
  type        = number
  default     = 5
}

#Defines the github token secret arn input value.
variable "github_token_secret_arn" {
  description = "Secrets Manager ARN for the GitHub PAT used to create incident issues. Leave empty to skip GitHub issue creation."
  type        = string
  default     = ""
}

#Defines the github repo input value.
variable "github_repo" {
  description = "GitHub repository in owner/name format for incident issue creation. Empty = skip GitHub issue creation."
  type        = string
  default     = ""
}

#Defines the dry run input value.
variable "dry_run" {
  description = "When true, the Lambda logs what it would do but executes no healing actions. Safe for testing."
  type        = bool
  default     = false
}

#Defines the application namespace input value.
variable "application_namespace" {
  description = "Kubernetes namespace of the managed application"
  type        = string
  default     = "cloudops"
}

#Defines the application name input value.
variable "application_name" {
  description = "Kubernetes Deployment/HPA name of the managed application"
  type        = string
  default     = "order-api"
}

#Defines the tags input value.
variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
