# ALB security group — internet-facing, accepts HTTP/HTTPS from allowed CIDRs
resource "aws_security_group" "alb" {
  name_prefix = "${var.name_prefix}-alb-sg-"
  description = "Security group for Application Load Balancer - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle { create_before_destroy = true }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-alb-sg", Tier = "loadbalancer" })
}

resource "aws_security_group_rule" "alb_ingress_https" {
  count             = var.enable_https ? 1 : 0
  type              = "ingress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "HTTPS from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_http" {
  count             = var.enable_http ? 1 : 0
  type              = "ingress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "HTTP from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_ingress_custom" {
  count             = length(var.custom_alb_ports)
  type              = "ingress"
  from_port         = var.custom_alb_ports[count.index]
  to_port           = var.custom_alb_ports[count.index]
  protocol          = "tcp"
  cidr_blocks       = var.allowed_cidr_blocks
  description       = "Custom port ${var.custom_alb_ports[count.index]} from allowed CIDR blocks"
  security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "alb_egress_eks_nodes" {
  type                     = "egress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  description              = "All TCP traffic to EKS nodes"
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

# EKS node security group
resource "aws_security_group" "eks_nodes" {
  name_prefix = "${var.name_prefix}-eks-nodes-sg-"
  description = "Security group for EKS worker nodes - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle { create_before_destroy = true }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-eks-nodes-sg", Tier = "application" })
}

# Node-to-node — required for pod-to-pod communication across nodes
resource "aws_security_group_rule" "eks_nodes_ingress_self" {
  type              = "ingress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  self              = true
  description       = "Node-to-node: allow all traffic within the node security group"
  security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_ingress_alb" {
  type                     = "ingress"
  from_port                = 0
  to_port                  = 65535
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.alb.id
  description              = "All TCP from ALB to node ports"
  security_group_id        = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_https" {
  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to internet for ECR pulls and EKS API server"
  security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_http" {
  type              = "egress"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTP to internet"
  security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_rds" {
  type                     = "egress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds.id
  description              = "Database access to RDS"
  security_group_id        = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_dns_udp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "udp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (UDP)"
  security_group_id = aws_security_group.eks_nodes.id
}

resource "aws_security_group_rule" "eks_nodes_egress_dns_tcp" {
  type              = "egress"
  from_port         = 53
  to_port           = 53
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "DNS resolution (TCP)"
  security_group_id = aws_security_group.eks_nodes.id
}

# RDS security group — only accepts traffic from EKS nodes
resource "aws_security_group" "rds" {
  name_prefix = "${var.name_prefix}-rds-sg-"
  description = "Security group for RDS database - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle { create_before_destroy = true }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-rds-sg", Tier = "database" })
}

resource "aws_security_group_rule" "rds_ingress_eks_nodes" {
  type                     = "ingress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.eks_nodes.id
  description              = "Database access from EKS nodes"
  security_group_id        = aws_security_group.rds.id
}

# VPC endpoints security group — allows HTTPS from within the VPC only
resource "aws_security_group" "vpc_endpoints" {
  name_prefix = "${var.name_prefix}-vpc-endpoints-sg-"
  description = "Security group for VPC endpoints - ${var.environment}"
  vpc_id      = aws_vpc.main.id

  lifecycle { create_before_destroy = true }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-vpc-endpoints-sg", Tier = "infrastructure" })
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
