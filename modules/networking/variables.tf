#This file defines variables settings for CloudOps.
#CloudOps Networking Module - Variables
#Input variables for VPC and networking configuration

#General Configuration

variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the name prefix input value.
variable "name_prefix" {
  description = "Prefix for resource names (e.g., cloudops-dev, myapp-prod)"
  type        = string

  validation {
    condition     = length(var.name_prefix) > 0 && length(var.name_prefix) <= 32
    error_message = "Name prefix must be between 1 and 32 characters."
  }
}

#EKS Configuration

variable "eks_cluster_name" {
  description = "EKS cluster name used for subnet tags (kubernetes.io/cluster/<name>=shared). Must match the cluster name in the compute module."
  type        = string
}

#Availability Zone Configuration

variable "az_count" {
  description = "Number of Availability Zones to use (will be capped at 3 for cost optimization)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 1 && var.az_count <= 6
    error_message = "AZ count must be between 1 and 6."
  }
}

#VPC and Subnet Configuration

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

#Defines the public subnet cidrs input value.
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

#Defines the private subnet cidrs input value.
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

#Defines the database subnet cidrs input value.
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

#NAT Gateway Configuration

variable "enable_nat_gateway" {
  description = <<-EOT
    Enable NAT gateways for private subnet internet access.
    When true, creates one NAT gateway per AZ for high availability.
    Set to false in dev environments to save costs (~$32/month per NAT gateway).
  EOT
  type        = bool
  default     = true
}

#VPC Flow Logs Configuration

variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs for network monitoring and troubleshooting"
  type        = bool
  default     = false
}

#Defines the flow logs destination input value.
variable "flow_logs_destination" {
  description = "Where to send VPC flow logs. \"cloudwatch\" = quick + queryable, more expensive at scale. \"s3\" = cheaper, parquet + Athena partitioning."
  type        = string
  default     = "cloudwatch"

  validation {
    condition     = contains(["cloudwatch", "s3"], var.flow_logs_destination)
    error_message = "flow_logs_destination must be one of: cloudwatch, s3."
  }
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID — used for globally unique flow-logs S3 bucket name."
  type        = string
  default     = ""
}

#Defines the buckets force destroy input value.
variable "buckets_force_destroy" {
  description = "Allow `terraform destroy` to nuke flow-logs S3 bucket even if it contains objects. Set true in test envs only."
  type        = bool
  default     = true
}

#Defines the flow logs retention days input value.
variable "flow_logs_retention_days" {
  description = "Number of days to retain VPC Flow Logs in CloudWatch"
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "Flow logs retention must be a valid CloudWatch Logs retention period."
  }
}

#Security Group Configuration

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

#Defines the enable HTTPS input value.
variable "enable_https" {
  description = "Enable HTTPS (port 443) on the ALB security group"
  type        = bool
  default     = true
}

#Defines the enable HTTP input value.
variable "enable_http" {
  description = "Enable HTTP (port 80) on the ALB security group"
  type        = bool
  default     = true
}

#Defines the custom alb ports input value.
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

#Defines the RDS port input value.
variable "rds_port" {
  description = "Port for RDS database (default 5432 for PostgreSQL)"
  type        = number
  default     = 5432

  validation {
    condition     = var.rds_port >= 1 && var.rds_port <= 65535
    error_message = "RDS port must be between 1 and 65535."
  }
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
