# ECS Fargate cluster with Container Insights for monitoring
resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-cluster"
  })
}

# CloudWatch log group for ECS container logs
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7

  tags = merge(local.common_tags, {
    Name = "${local.name}-logs"
  })
}
