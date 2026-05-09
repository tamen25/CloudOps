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

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID — passed to the Lambda for Cost Explorer linked-account filtering"
  type        = string
  default     = ""
}

#Defines the cost budget monthly usd input value.
variable "cost_budget_monthly_usd" {
  description = "Monthly cost budget in USD — triggers WARNING at 80% and CRITICAL at 100%"
  type        = number
  default     = 50
}

#Defines the cost alert email input value.
variable "cost_alert_email" {
  description = "Email address for SNS cost alert subscriptions. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

#Defines the cost anomaly threshold percent input value.
variable "cost_anomaly_threshold_percent" {
  description = "Percentage increase over 7-day average that triggers a cost anomaly alert"
  type        = number
  default     = 20
}

#Defines the EKS cluster name input value.
variable "eks_cluster_name" {
  description = "EKS cluster name — passed to idle detector Lambda for Container Insights queries. Leave empty to skip EKS checks."
  type        = string
  default     = ""
}

#Defines the RDS instance ID input value.
variable "rds_instance_id" {
  description = "RDS instance identifier — passed to idle detector Lambda for utilization checks. Leave empty to skip RDS checks."
  type        = string
  default     = ""
}

#Defines the idle cpu threshold input value.
variable "idle_cpu_threshold" {
  description = "CPU utilization percentage below which a node/cluster is considered idle (EKS node check)"
  type        = number
  default     = 10
}

#Defines the idle request threshold input value.
variable "idle_request_threshold" {
  description = "Database connection count below which an RDS instance is considered idle"
  type        = number
  default     = 1
}

#Defines the tags input value.
variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
