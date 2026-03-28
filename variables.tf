# CloudOps - Root Variables
# Centralized variable definitions for all modules

# Module Toggle Controls

variable "enable_networking" {
  description = "Enable/disable networking module deployment"
  type        = bool
  default     = false
}

variable "enable_eks" {
  description = "Enable/disable EKS module deployment"
  type        = bool
  default     = false
}

variable "enable_database" {
  description = "Enable/disable database module deployment"
  type        = bool
  default     = false
}

variable "enable_ingress" {
  description = "Enable/disable ingress module deployment (requires EKS cluster to exist first)"
  type        = bool
  default     = false
}

variable "enable_observability" {
  description = "Enable/disable observability module (LGTM stack — requires enable_eks and enable_ingress first)"
  type        = bool
  default     = false
}

variable "enable_slo" {
  description = "Enable/disable SLO module (Lambda error budget tracker + DynamoDB — requires enable_observability first)"
  type        = bool
  default     = false
}

variable "enable_security" {
  description = "Enable/disable security module (Falco runtime threat detection + compliance scanner — requires enable_eks and enable_observability first)"
  type        = bool
  default     = false
}

variable "enable_finops" {
  description = "Enable/disable FinOps module (Cost Explorer ingestion, anomaly detection, AWS Budgets — standalone, no other modules required)"
  type        = bool
  default     = false
}

variable "enable_self_healing" {
  description = "Enable/disable self-healing module (CloudWatch Alarm-driven automated remediation — requires enable_eks and enable_observability first)"
  type        = bool
  default     = false
}

variable "self_healing_alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch ALB metric dimensions (last two path segments). Set after first ingress deploy. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

variable "self_healing_target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch ALB target metrics. Set after first ingress deploy. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

variable "self_healing_min_healthy_pods" {
  description = "Minimum healthy order-api pods — triggers scale-out healing when count drops below this"
  type        = number
  default     = 2
}

variable "self_healing_max_scale_out_pods" {
  description = "Maximum pods the self-healing controller may scale out to in a single healing action"
  type        = number
  default     = 10
}

variable "self_healing_rollback_on_error_rate" {
  description = "5xx error rate percentage threshold (0-100) that triggers an automatic rollback of order-api"
  type        = number
  default     = 5
}

variable "self_healing_dry_run" {
  description = "When true, the self-healing Lambda logs actions but does not execute them. Safe for initial testing."
  type        = bool
  default     = false
}

variable "cost_budget_monthly_usd" {
  description = "Monthly cost budget in USD — triggers WARNING alert at 80% and CRITICAL alert at 100%"
  type        = number
  default     = 50
}

variable "cost_alert_email" {
  description = "Email address for SNS cost alert subscriptions (budget threshold + anomaly alerts). Leave empty to skip."
  type        = string
  default     = ""
}

variable "cost_anomaly_threshold_percent" {
  description = "Percentage increase over 7-day average that triggers a cost anomaly alert per service"
  type        = number
  default     = 20
}

variable "security_alert_email" {
  description = "Email address for SNS security alert subscriptions — receives all severity findings from the compliance scanner. Leave empty to skip."
  type        = string
  default     = ""
}

variable "security_critical_email" {
  description = "Email address for HIGH/CRITICAL-only SNS alerts (pager / on-call inbox). Leave empty to skip."
  type        = string
  default     = ""
}

# github_token stores the actual PAT value (sensitive).
# When provided, the bootstrap module creates an aws_secretsmanager_secret and the
# ARN is automatically wired to the security module. This is the preferred approach.
#
# If you have an existing secret ARN, leave github_token empty and set
# security_github_token_secret_arn to the ARN directly instead.
variable "github_token" {
  description = "GitHub personal access token with repo scope — bootstrap stores it in Secrets Manager so the auto-remediation Lambda can create GitHub issues. Leave empty to skip or use security_github_token_secret_arn for an existing secret."
  type        = string
  sensitive   = true
  default     = ""
}

variable "security_github_token_secret_arn" {
  description = "Existing Secrets Manager ARN for a GitHub PAT — used when the secret is managed outside Terraform. Takes effect only when github_token is empty."
  type        = string
  default     = ""
}

variable "security_github_repo" {
  description = "GitHub repository in owner/name format where the auto-remediation Lambda creates security issues"
  type        = string
  default     = "tamen25/CloudOps"
}

variable "slo_grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN for the Grafana API key used by the SLO Lambda. Required when prometheus_url is the Grafana datasource proxy."
  type        = string
  default     = ""
}

variable "slo_prometheus_url" {
  description = "Override Prometheus URL for the SLO module when enable_observability=false. Defaults to the observability module output when enable_observability=true."
  type        = string
  default     = ""
}

variable "aws_account_id" {
  description = "AWS account ID — used for globally unique S3 bucket names in the observability module"
  type        = string
  default     = ""
}

variable "alb_dns_name" {
  description = "ALB DNS name created by the Load Balancer Controller (set after first deploy)"
  type        = string
  default     = ""
}

variable "alb_zone_id" {
  description = "ALB hosted zone ID for Route 53 alias records (set after first deploy)"
  type        = string
  default     = ""
}

variable "destroy_all" {
  description = "DANGER: Set to true to destroy ALL infrastructure including bootstrap. Set networking and eks to false first!"
  type        = bool
  default     = false
}

# General Configuration

variable "region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.region))
    error_message = "Region must be a valid AWS region (e.g., us-east-1)."
  }
}

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string

  validation {
    condition     = length(var.project_name) > 0 && length(var.project_name) <= 32
    error_message = "Project name must be between 1 and 32 characters."
  }
}

variable "owner" {
  description = "Owner or team responsible for resources"
  type        = string
  default     = ""
}

# Networking Module Variables

variable "az_count" {
  description = "Number of Availability Zones to use (will be capped at 3 for cost optimization)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 1 && var.az_count <= 6
    error_message = "AZ count must be between 1 and 6."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.public_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All public subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.private_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All private subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "db_subnet_cidrs" {
  description = "List of CIDR blocks for database subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.db_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All database subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

variable "enable_nat_gateway" {
  description = <<-EOT
    Enable NAT gateways for private subnet internet access.
    When true, creates one NAT gateway per AZ for high availability.
    Set to false in dev environments to save costs (~$32/month per NAT gateway).
  EOT
  type        = bool
  default     = true
}

variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs for network monitoring and troubleshooting"
  type        = bool
  default     = false
}

variable "flow_logs_retention_days" {
  description = "Number of days to retain VPC Flow Logs in CloudWatch"
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "Flow logs retention must be a valid CloudWatch Logs retention period."
  }
}

variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access ALB (e.g., ['0.0.0.0/0'] for public access)"
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition = alltrue([
      for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))
    ])
    error_message = "All allowed CIDR blocks must be valid IPv4 CIDR blocks."
  }
}

variable "enable_https" {
  description = "Enable HTTPS (port 443) on the ALB security group"
  type        = bool
  default     = true
}

variable "enable_http" {
  description = "Enable HTTP (port 80) on the ALB security group"
  type        = bool
  default     = true
}

variable "custom_alb_ports" {
  description = "Additional custom ports to open on the ALB security group"
  type        = list(number)
  default     = []

  validation {
    condition = alltrue([
      for port in var.custom_alb_ports : port >= 1 && port <= 65535
    ])
    error_message = "All custom ports must be between 1 and 65535."
  }
}

variable "rds_port" {
  description = "Port for RDS database (default 5432 for PostgreSQL)"
  type        = number
  default     = 5432

  validation {
    condition     = var.rds_port >= 1 && var.rds_port <= 65535
    error_message = "RDS port must be between 1 and 65535."
  }
}

# EKS Module Variables

variable "eks_kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.32"
}

variable "eks_node_instance_types" {
  description = "EC2 instance types for the EKS managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

variable "eks_node_min_size" {
  description = "Minimum number of nodes in the EKS node group"
  type        = number
  default     = 2
}

variable "eks_node_max_size" {
  description = "Maximum number of nodes in the EKS node group"
  type        = number
  default     = 6
}

variable "eks_node_desired_size" {
  description = "Desired number of nodes in the EKS node group"
  type        = number
  default     = 2
}

variable "order_api_namespace" {
  description = "Kubernetes namespace for the order-api service account (IRSA)"
  type        = string
  default     = "cloudops"
}

variable "order_api_service_account" {
  description = "Kubernetes service account name for order-api IRSA"
  type        = string
  default     = "order-api"
}

# Existing Infrastructure (for EKS-only deployments without networking module)

variable "existing_vpc_id" {
  description = "Existing VPC ID (required if enable_networking is false and enable_eks is true)"
  type        = string
  default     = ""
}

variable "existing_private_subnet_ids" {
  description = "Existing private subnet IDs (required if enable_networking is false and enable_eks is true)"
  type        = list(string)
  default     = []
}

variable "existing_public_subnet_ids" {
  description = "Existing public subnet IDs (required if enable_networking is false and enable_eks is true)"
  type        = list(string)
  default     = []
}

variable "existing_node_sg_id" {
  description = "Existing EKS node security group ID (required if enable_networking is false and enable_eks is true)"
  type        = string
  default     = ""
}

# Bootstrap Module Variables

variable "bootstrap_bucket_name" {
  description = "S3 bucket name for Terraform state (uses project-tfstate-bucket format)"
  type        = string
  default     = ""
}

variable "bootstrap_create_kms" {
  description = "Create KMS key for state encryption"
  type        = bool
  default     = true
}

variable "bootstrap_kms_deletion_window" {
  description = "KMS key deletion window in days (7-30)"
  type        = number
  default     = 30
}

variable "bootstrap_additional_trusted_arns" {
  description = "Additional IAM ARNs that can assume deployer role"
  type        = list(string)
  default     = []
}

variable "bootstrap_require_mfa" {
  description = "Require MFA for deployer role"
  type        = bool
  default     = false
}

variable "bootstrap_external_id" {
  description = "External ID for cross-account access"
  type        = string
  default     = ""
}

variable "bootstrap_max_session_duration" {
  description = "Maximum session duration in seconds (3600-43200)"
  type        = number
  default     = 3600
}

variable "bootstrap_additional_policy_arns" {
  description = "Additional IAM policy ARNs for deployer role"
  type        = list(string)
  default     = []
}

# Database Module Variables

variable "database_instance_class" {
  description = "RDS instance class (e.g., db.t3.micro for dev, db.r6g.large for prod)"
  type        = string
  default     = "db.t3.micro"
}

variable "database_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

variable "database_max_allocated_storage" {
  description = "Maximum storage for autoscaling (0 to disable)"
  type        = number
  default     = 100
}

variable "database_engine" {
  description = "Database engine (postgres, mysql, etc.)"
  type        = string
  default     = "postgres"
}

variable "database_engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.5"
}

variable "database_name" {
  description = "Initial database name to create"
  type        = string
  default     = "cloudops"
}

variable "database_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

variable "database_multi_az" {
  description = "Enable Multi-AZ deployment for automatic failover"
  type        = bool
  default     = false
}

variable "database_create_read_replica" {
  description = "Create a read replica for DR/scaling"
  type        = bool
  default     = false
}

variable "database_backup_retention_period" {
  description = "Number of days to retain automated backups (0-35)"
  type        = number
  default     = 7
}

variable "database_deletion_protection" {
  description = "Enable deletion protection (recommended for production)"
  type        = bool
  default     = false
}

variable "database_skip_final_snapshot" {
  description = "Skip final snapshot on deletion (set false for production)"
  type        = bool
  default     = true
}

variable "database_performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

variable "database_monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60
}
