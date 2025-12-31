# modules/compute/variables.tf
# Input variables for the compute module (ECS Fargate, ALB, ECR, autoscaling)

variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
}

variable "private_subnets" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "public_subnets" {
  description = "List of public subnet IDs for ALB"
  type        = list(string)
}

variable "alb_sg_id" {
  description = "Security group ID for the Application Load Balancer"
  type        = string
}

variable "ecs_task_sg_id" {
  description = "Security group ID for ECS tasks"
  type        = string
}

variable "container_image" {
  description = "Docker image to deploy (e.g., 'nginx:latest' or ECR URL with tag). Update this to trigger redeployments."
  type        = string
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

variable "desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "cpu" {
  description = "CPU units for Fargate task (256, 512, 1024, 2048, 4096)"
  type        = string
  default     = "256"
}

variable "memory" {
  description = "Memory for Fargate task in MB (512, 1024, 2048, etc.)"
  type        = string
  default     = "512"
}

variable "autoscaling_min_capacity" {
  description = "Minimum number of tasks for autoscaling"
  type        = number
  default     = 1
}

variable "autoscaling_max_capacity" {
  description = "Maximum number of tasks for autoscaling"
  type        = number
  default     = 10
}

variable "autoscaling_cpu_target" {
  description = "Target CPU utilization percentage for autoscaling"
  type        = number
  default     = 70
}

variable "autoscaling_memory_target" {
  description = "Target memory utilization percentage for autoscaling"
  type        = number
  default     = 80
}

variable "health_check_path" {
  description = "Health check path for ALB target group"
  type        = string
  default     = "/health"
}

variable "tags" {
  description = "Additional tags for resources"
  type        = map(string)
  default     = {}
}
