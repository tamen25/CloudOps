variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "region" {
  description = "AWS region"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  default     = ""
}

variable "eks_cluster_name" {
  description = "EKS cluster name — required for Kubernetes API calls and node group scaling"
  type        = string
  default     = ""
}

variable "rds_instance_id" {
  description = "RDS instance identifier — required for RDS alarms and remediation. Leave empty to skip RDS alarms."
  type        = string
  default     = ""
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (last two path segments of the ARN) for CloudWatch ALB metrics. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

variable "target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch ALB target metrics. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

variable "min_healthy_pods" {
  description = "Minimum number of healthy order-api pods — triggers scale-out healing when current count drops below this"
  type        = number
  default     = 2
}

variable "max_scale_out_pods" {
  description = "Maximum pods the self-healing controller is allowed to scale out to in a single healing action"
  type        = number
  default     = 10
}

variable "rollback_on_error_rate" {
  description = "5xx error rate percentage threshold (0-100) that triggers an automatic rollback of order-api"
  type        = number
  default     = 5
}

variable "github_token_secret_arn" {
  description = "Secrets Manager ARN for the GitHub PAT used to create incident issues. Leave empty to skip GitHub issue creation."
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository in owner/name format for incident issue creation. Empty = skip GitHub issue creation."
  type        = string
  default     = ""
}

variable "dry_run" {
  description = "When true, the Lambda logs what it would do but executes no healing actions. Safe for testing."
  type        = bool
  default     = false
}

variable "application_namespace" {
  description = "Kubernetes namespace of the managed application"
  type        = string
  default     = "cloudops"
}

variable "application_name" {
  description = "Kubernetes Deployment/HPA name of the managed application"
  type        = string
  default     = "order-api"
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
