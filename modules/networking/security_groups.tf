resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-sg-"
  description = "Security group for Application Load Balancer - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-alb-sg"
      Tier = "loadbalancer"
    }
  )
}

resource "aws_security_group_rule" "alb_ingress_https" {
  count = var.enable_https ? 1 : 0

  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "HTTPS from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_http" {
  count = var.enable_http ? 1 : 0

  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "HTTP from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_custom" {
  count = length(var.custom_alb_ports)

  type              = "ingress"
  from_port         = var.custom_alb_ports[count.index]
  to_port           = var.custom_alb_ports[count.index]
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "Custom port ${var.custom_alb_ports[count.index]} from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress_ecs" {
  type                     = "egress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "All TCP traffic to ECS tasks"
  security_group_id        = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to internet for external health checks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group" "ecs_tasks" {
  name_prefix = "${var.name_prefix}-ecs-tasks-sg-"
  description = "Security group for ECS tasks - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-ecs-tasks-sg"
      Tier = "application"
    }
  )
}

resource "aws_security_group_rule" "ecs_ingress_alb_http" {
  type                     = "ingress"
  from_port                = 80
  to_port                  = 80
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "HTTP from ALB"
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_ingress_alb_https" {
  type                     = "ingress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "HTTPS from ALB"
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_ingress_alb_app_port" {
  type                     = "ingress"
  from_port                = 1024
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "Custom application ports from ALB"
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to internet for external API calls"
  security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_http" {
  type              = "egress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP to internet"
  security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_rds" {
  type                     = "egress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  description              = "Database access to RDS"
  security_group_id        = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_dns_udp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (UDP)"
  security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group_rule" "ecs_egress_dns_tcp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (TCP)"
  security_group_id = aws_security_group.ecs_tasks.id
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-sg-"
  description = "Security group for RDS database - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-rds-sg"
      Tier = "database"
    }
  )
}

resource "aws_security_group_rule" "rds_ingress_ecs" {
  type                     = "ingress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "Database access from ECS tasks"
  security_group_id        = aws_security_group.rds.id
}

resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${var.name_prefix}-vpc-endpoints-sg-"
  description = "Security group for VPC endpoints - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-vpc-endpoints-sg"
      Tier = "infrastructure"
    }
  )
}

resource "aws_security_group_rule" "vpc_endpoints_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [aws_vpc.main.cidr_block]
  description       = "HTTPS from VPC for AWS service endpoints"
  security_group_id = aws_security_group.vpc_endpoints.id
}
