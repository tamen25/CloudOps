variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID — passed to the Lambda for Cost Explorer linked-account filtering"
  type        = string
  default     = ""
}

variable "cost_budget_monthly_usd" {
  description = "Monthly cost budget in USD — triggers WARNING at 80% and CRITICAL at 100%"
  type        = number
  default     = 50
}

variable "cost_alert_email" {
  description = "Email address for SNS cost alert subscriptions. Leave empty to skip email subscription."
  type        = string
  default     = ""
}

variable "cost_anomaly_threshold_percent" {
  description = "Percentage increase over 7-day average that triggers a cost anomaly alert"
  type        = number
  default     = 20
}

variable "enable_budget_hardcap_action" {
  description = "Attach an aws_budgets_budget_action that applies a deny policy when ACTUAL spend crosses budget_hardcap_threshold_percent. OFF by default — a too-low cap will brick deploys. Requires budget_hardcap_target_role_names."
  type        = bool
  default     = false
}

variable "budget_hardcap_threshold_percent" {
  description = "Percentage of cost_budget_monthly_usd at which the hard-cap deny policy is applied. Should sit ABOVE the 100% CRITICAL notification (default 120% = 20% over budget)."
  type        = number
  default     = 120

  validation {
    condition     = var.budget_hardcap_threshold_percent > 0
    error_message = "budget_hardcap_threshold_percent must be greater than 0."
  }
}

variable "budget_hardcap_target_role_names" {
  description = "IAM role NAMES (not ARNs) the hard-cap deny policy attaches to when the cap is breached — typically the GitHub Actions deploy role and any node/instance-launching role. Empty disables the action even if enable_budget_hardcap_action=true."
  type        = list(string)
  default     = []
}

variable "eks_cluster_name" {
  description = "EKS cluster name — passed to idle detector Lambda for Container Insights queries. Leave empty to skip EKS checks."
  type        = string
  default     = ""
}

variable "rds_instance_id" {
  description = "RDS instance identifier — passed to idle detector Lambda for utilization checks. Leave empty to skip RDS checks."
  type        = string
  default     = ""
}

variable "idle_cpu_threshold" {
  description = "CPU utilization percentage below which a node/cluster is considered idle (EKS node check)"
  type        = number
  default     = 10
}

variable "idle_request_threshold" {
  description = "Database connection count below which an RDS instance is considered idle"
  type        = number
  default     = 1
}

variable "tags" {
  description = "Common tags applied to all resources"
  type        = map(string)
  default     = {}
}
