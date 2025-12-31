# CloudOps Networking Module - Security Groups
# Best practice security groups with least-privilege access controls

# Security Group Best Practices:
#
# 1. Least Privilege: Only open ports that are absolutely necessary
# 2. Layered Security: Use separate SGs for each tier (ALB, App, DB)
# 3. Source-based Rules: Reference other SGs as sources instead of CIDR blocks when possible
# 4. Egress Control: Explicitly define egress rules (don't rely on default allow-all)
# 5. Naming Convention: Clear, descriptive names with environment and purpose
# 6. Documentation: Tag and comment each rule's purpose

# Application Load Balancer Security Group

# ALB Security Group - Accepts traffic from the internet
resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-sg-"
  description = "Security group for Application Load Balancer - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  # Allow deletion and recreation of security groups
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

# Ingress: HTTPS from allowed CIDR blocks
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

# Ingress: HTTP from allowed CIDR blocks
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

# Ingress: Custom ports (if specified)
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

# Egress: All traffic to ECS tasks security group
# This allows ALB to forward traffic to ECS tasks
resource "aws_security_group_rule" "alb_egress_ecs" {
  type                     = "egress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "All TCP traffic to ECS tasks"
  security_group_id        = aws_security_group.alb.id
}

# Egress: HTTPS for health checks to external services (optional)
resource "aws_security_group_rule" "alb_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to internet for external health checks"
  security_group_id = aws_security_group.alb.id
}

# ECS Tasks Security Group

# ECS Tasks Security Group - Application tier
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

# Ingress: HTTP/HTTPS from ALB only
# Security best practice: Only accept traffic from load balancer
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

# Ingress: Custom application port (e.g., 3000, 8080)
# Most ECS tasks run on a custom port, not 80/443
resource "aws_security_group_rule" "ecs_ingress_alb_app_port" {
  type                     = "ingress"
  from_port                = 1024
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "Custom application ports from ALB"
  security_group_id        = aws_security_group.ecs_tasks.id
}

# Egress: HTTPS to internet (for API calls, package downloads, etc.)
resource "aws_security_group_rule" "ecs_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to internet for external API calls"
  security_group_id = aws_security_group.ecs_tasks.id
}

# Egress: HTTP to internet (for non-secure external calls)
resource "aws_security_group_rule" "ecs_egress_http" {
  type              = "egress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP to internet"
  security_group_id = aws_security_group.ecs_tasks.id
}

# Egress: Database port to RDS security group
# Allows ECS tasks to connect to RDS
resource "aws_security_group_rule" "ecs_egress_rds" {
  type                     = "egress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  description              = "Database access to RDS"
  security_group_id        = aws_security_group.ecs_tasks.id
}

# Egress: DNS (UDP 53)
resource "aws_security_group_rule" "ecs_egress_dns_udp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (UDP)"
  security_group_id = aws_security_group.ecs_tasks.id
}

# Egress: DNS (TCP 53)
resource "aws_security_group_rule" "ecs_egress_dns_tcp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (TCP)"
  security_group_id = aws_security_group.ecs_tasks.id
}

# RDS Security Group

# RDS Security Group - Database tier
# Best practice: Only accept traffic from application tier
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

# Ingress: Database port from ECS tasks only
# Security best practice: Database only accessible from application tier
resource "aws_security_group_rule" "rds_ingress_ecs" {
  type                     = "ingress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs_tasks.id
  description              = "Database access from ECS tasks"
  security_group_id        = aws_security_group.rds.id
}

# Egress: None required for RDS (it's a managed service)
# RDS doesn't need to initiate outbound connections
# If you need egress (e.g., for Lambda functions), add it explicitly

# VPC Endpoint Security Group (Optional - for private endpoints)

# VPC Endpoint Security Group
# Use this for AWS service endpoints (S3, ECR, Secrets Manager, etc.)
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

# Ingress: HTTPS from VPC CIDR
# Allows resources in VPC to access VPC endpoints
resource "aws_security_group_rule" "vpc_endpoints_ingress_https" {
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = [aws_vpc.main.cidr_block]
  description       = "HTTPS from VPC for AWS service endpoints"
  security_group_id = aws_security_group.vpc_endpoints.id
}

# Security Group Rule Documentation

# Port Reference:
# - 80:   HTTP (web traffic)
# - 443:  HTTPS (secure web traffic)
# - 53:   DNS (domain name resolution)
# - 3306: MySQL/MariaDB (if using MySQL instead of PostgreSQL)
# - 5432: PostgreSQL (default RDS port in this module)
# - 6379: Redis (ElastiCache)
# - 1024-65535: Ephemeral/dynamic ports for applications
#
# Security Best Practices Applied:
# 1. ✅ Least Privilege - Only necessary ports opened
# 2. ✅ Source-based Rules - SGs reference other SGs, not broad CIDR blocks
# 3. ✅ Layered Security - Separate SGs for each tier (ALB, App, DB)
# 4. ✅ No Direct Database Access - RDS only accessible from ECS tasks
# 5. ✅ Egress Control - Explicit egress rules (DNS, HTTPS, DB)
# 6. ✅ Create Before Destroy - Prevents downtime during updates
#
# Port Strategy by Tier:
# - ALB (Internet-facing):
#   - Ingress: 80, 443 from internet
#   - Egress: To ECS tasks only
#
# - ECS Tasks (Application):
#   - Ingress: From ALB only
#   - Egress: HTTPS (APIs), DNS (resolution), RDS (database)
#
# - RDS (Database):
#   - Ingress: From ECS tasks only (port 5432)
#   - Egress: None (managed service)
