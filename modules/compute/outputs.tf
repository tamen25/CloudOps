# CloudOps Compute Module Outputs

# ECR Outputs
output "ecr_repository_url" {
  description = "ECR repository URL for pushing Docker images"
  value       = aws_ecr_repository.main.repository_url
}

output "ecr_repository_arn" {
  description = "ECR repository ARN"
  value       = aws_ecr_repository.main.arn
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.main.name
}

# ECS Cluster Outputs
output "ecs_cluster_id" {
  description = "ECS cluster ID"
  value       = aws_ecs_cluster.main.id
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.main.arn
}

# ECS Service Outputs
output "ecs_service_id" {
  description = "ECS service ID"
  value       = aws_ecs_service.main.id
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.main.name
}

# ALB Outputs
output "alb_dns_name" {
  description = "ALB DNS name for accessing the application"
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "ALB hosted zone ID (for Route53 alias records)"
  value       = aws_lb.main.zone_id
}

# Target Group Outputs
output "target_group_arn" {
  description = "Target group ARN"
  value       = aws_lb_target_group.main.arn
}

# CloudWatch Log Group
output "log_group_name" {
  description = "CloudWatch log group name for ECS tasks"
  value       = aws_cloudwatch_log_group.ecs.name
}

# IAM Role Outputs
output "ecs_task_role_arn" {
  description = "ECS task role ARN (for application permissions)"
  value       = aws_iam_role.ecs_task.arn
}

output "ecs_task_execution_role_arn" {
  description = "ECS task execution role ARN (for ECS service)"
  value       = aws_iam_role.ecs_task_execution.arn
}
