# modules/compute/main.tf
# Main resources: ECR, ECS Cluster, Task Definition, Service, ALB, Autoscaling

locals {
  name = "${var.name_prefix}-${var.environment}"
  common_tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Module      = "compute"
    },
    var.tags
  )
}

# 
# ECR Repository
# 
# Container image registry for storing application Docker images
resource "aws_ecr_repository" "main" {
  name                 = "${local.name}-app"
  image_tag_mutability = "MUTABLE"

  # Enable image scanning for security
  image_scanning_configuration {
    scan_on_push = true
  }

  # Lifecycle policy to keep only recent images
  lifecycle {
    prevent_destroy = false
  }

  tags = merge(local.common_tags, {
    Name = "${local.name}-ecr"
  })
}

# ECR lifecycle policy to remove old images
resource "aws_ecr_lifecycle_policy" "main" {
  repository = aws_ecr_repository.main.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = {
        type = "expire"
      }
    }]
  })
}

# 
# ECS Cluster
# 
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

# 
# CloudWatch Log Group
# 
# Store container logs from ECS tasks
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name}"
  retention_in_days = 7

  tags = merge(local.common_tags, {
    Name = "${local.name}-logs"
  })
}

# 
# IAM Roles for ECS
# 
# Task execution role: allows ECS to pull images and write logs
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task role: allows containers to call AWS APIs (CloudWatch, etc.)
resource "aws_iam_role" "ecs_task" {
  name = "${local.name}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      }
    }]
  })

  tags = local.common_tags
}

# Allow task to publish CloudWatch metrics
resource "aws_iam_role_policy" "ecs_task_cloudwatch" {
  name = "cloudwatch-metrics"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "cloudwatch:PutMetricData"
      ]
      Resource = "*"
    }]
  })
}

# 
# ECS Task Definition
# 
# Defines the container configuration for Fargate
# NOTE: Update var.container_image (including tag) to trigger rolling deployment
resource "aws_ecs_task_definition" "main" {
  family                   = "${local.name}-task"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([{
    name  = "app"
    image = var.container_image # Change this (including tag) to deploy new version

    portMappings = [{
      containerPort = var.container_port
      protocol      = "tcp"
    }]

    # Environment variables passed to container
    environment = [
      {
        name  = "NODE_ENV"
        value = var.environment
      },
      {
        name  = "AWS_REGION"
        value = data.aws_region.current.name
      },
      {
        name  = "PORT"
        value = tostring(var.container_port)
      }
    ]

    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
        "awslogs-region"        = data.aws_region.current.name
        "awslogs-stream-prefix" = "ecs"
      }
    }

    healthCheck = {
      command     = ["CMD-SHELL", "curl -f http://localhost:${var.container_port}/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])

  tags = merge(local.common_tags, {
    Name = "${local.name}-task"
  })
}

# 
# Application Load Balancer
# 
resource "aws_lb" "main" {
  name               = "${local.name}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [var.alb_sg_id]
  subnets            = var.public_subnets

  enable_deletion_protection = false
  enable_http2               = true

  tags = merge(local.common_tags, {
    Name = "${local.name}-alb"
  })
}

# Target group for ECS service
resource "aws_lb_target_group" "main" {
  name        = "${local.name}-tg"
  port        = var.container_port
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip" # Required for Fargate

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = var.health_check_path
    matcher             = "200"
  }

  # Deregistration delay for graceful shutdown
  deregistration_delay = 30

  tags = merge(local.common_tags, {
    Name = "${local.name}-tg"
  })
}

# HTTP listener
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main.arn
  }
}

# 
# ECS Service
# 
resource "aws_ecs_service" "main" {
  name            = "${local.name}-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  # Rolling update configuration
  deployment_maximum_percent         = 200
  deployment_minimum_healthy_percent = 100

  network_configuration {
    subnets          = var.private_subnets
    security_groups  = [var.ecs_task_sg_id]
    assign_public_ip = false # Tasks in private subnets use NAT
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main.arn
    container_name   = "app"
    container_port   = var.container_port
  }

  # Force new deployment when task definition changes
  # This enables blue/green deployments when you update the image
  lifecycle {
    ignore_changes = [desired_count] # Allow autoscaling to manage this
  }

  depends_on = [
    aws_lb_listener.http
  ]

  tags = merge(local.common_tags, {
    Name = "${local.name}-service"
  })
}

# 
# Application Autoscaling
# 
resource "aws_appautoscaling_target" "ecs" {
  max_capacity       = var.autoscaling_max_capacity
  min_capacity       = var.autoscaling_min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

# CPU-based autoscaling policy
resource "aws_appautoscaling_policy" "ecs_cpu" {
  name               = "${local.name}-cpu-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = var.autoscaling_cpu_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# Memory-based autoscaling policy
resource "aws_appautoscaling_policy" "ecs_memory" {
  name               = "${local.name}-memory-autoscaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs.resource_id
  scalable_dimension = aws_appautoscaling_target.ecs.scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageMemoryUtilization"
    }
    target_value       = var.autoscaling_memory_target
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# 
# Data Sources
# 
data "aws_region" "current" {}
