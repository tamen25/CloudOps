# CloudOps Networking Module
# Creates VPC with public, private, and database subnets across multiple AZs
# Includes NAT gateways for private subnet internet access

# Data Sources

# Get available AZs in the region
data "aws_availability_zones" "available" {
  state = "available"
}

# Get current region
data "aws_region" "current" {}

# Local Variables

locals {
  # Use specified AZ count or all available (capped at 3 for cost)
  az_count = min(var.az_count, length(data.aws_availability_zones.available.names), 3)
  azs      = slice(data.aws_availability_zones.available.names, 0, local.az_count)

  # Generate subnet CIDRs if not provided
  # Public subnets: 10.0.0.0/24, 10.0.1.0/24, ...
  # Private subnets: 10.0.10.0/24, 10.0.11.0/24, ...
  # DB subnets: 10.0.20.0/24, 10.0.21.0/24, ...
  public_subnet_cidrs = var.public_subnet_cidrs != null ? var.public_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i)
  ]

  private_subnet_cidrs = var.private_subnet_cidrs != null ? var.private_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 10)
  ]

  db_subnet_cidrs = var.db_subnet_cidrs != null ? var.db_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 20)
  ]

  # Common tags merged with user-provided tags
  common_tags = merge(
    var.tags,
    {
      Module      = "networking"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  )
}

# VPC

resource "aws_vpc" "main" {
  cidr_block = var.vpc_cidr

  # Enable DNS hostnames for ECS and other services
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-vpc"
    }
  )
}

# Internet Gateway

# Internet Gateway for public subnet internet access
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-igw"
    }
  )
}

# Public Subnets

# Public subnets for load balancers, bastion hosts, NAT gateways
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true # Auto-assign public IPs

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-public-${local.azs[count.index]}"
      Type = "public"
      Tier = "public"
    }
  )
}

# Route table for public subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-public-rt"
    }
  )
}

# Route to Internet Gateway
resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.main.id
}

# Associate public subnets with public route table
resource "aws_route_table_association" "public" {
  count = local.az_count

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# NAT Gateways

# NAT Gateway Strategy:
# - High Availability: One NAT gateway per AZ (enable_nat_gateway = true)
#   Pros: No single point of failure, AZ isolation
#   Cons: Higher cost (~$32/month per NAT gateway)
#
# - Cost Optimized: Single NAT gateway in one AZ (future enhancement)
#   Pros: Lower cost (~$32/month total)
#   Cons: Single point of failure, cross-AZ data transfer charges
#
# For production, we use one NAT per AZ for reliability.
# For dev/staging, consider using a single NAT gateway to save costs.

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count = var.enable_nat_gateway ? local.az_count : 0

  domain = "vpc"

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-nat-eip-${local.azs[count.index]}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# NAT Gateways (one per AZ for HA)
resource "aws_nat_gateway" "main" {
  count = var.enable_nat_gateway ? local.az_count : 0

  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-nat-${local.azs[count.index]}"
    }
  )

  depends_on = [aws_internet_gateway.main]
}

# Private Subnets

# Private subnets for application servers, ECS tasks, Lambda, etc.
resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-private-${local.azs[count.index]}"
      Type = "private"
      Tier = "application"
    }
  )
}

# Route table for private subnets (one per AZ when using NAT per AZ)
# This allows each AZ to route through its own NAT gateway
resource "aws_route_table" "private" {
  count = local.az_count

  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-private-rt-${local.azs[count.index]}"
    }
  )
}

# Route to NAT Gateway (if enabled)
resource "aws_route" "private_nat" {
  count = var.enable_nat_gateway ? local.az_count : 0

  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}

# Associate private subnets with their respective route tables
resource "aws_route_table_association" "private" {
  count = local.az_count

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Database Subnets

# Database subnets for RDS, ElastiCache, etc.
# Isolated from internet, no NAT gateway access by default
resource "aws_subnet" "database" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.db_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-${local.azs[count.index]}"
      Type = "database"
      Tier = "data"
    }
  )
}

# Route table for database subnets (isolated, no internet access)
resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-rt"
    }
  )
}

# Associate database subnets with database route table
resource "aws_route_table_association" "database" {
  count = local.az_count

  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# DB Subnet Group for RDS
resource "aws_db_subnet_group" "main" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Database subnet group for ${var.name_prefix}"
  subnet_ids  = aws_subnet.database[*].id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-subnet-group"
    }
  )
}

# VPC Flow Logs (Optional - Best Practice)

# CloudWatch Log Group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "vpc_flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name              = "/aws/vpc/${var.name_prefix}-flow-logs"
  retention_in_days = var.flow_logs_retention_days

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-vpc-flow-logs"
    }
  )
}

# IAM Role for VPC Flow Logs
resource "aws_iam_role" "vpc_flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name = "${var.name_prefix}-vpc-flow-logs-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

# IAM Policy for VPC Flow Logs
resource "aws_iam_role_policy" "vpc_flow_logs" {
  count = var.enable_flow_logs ? 1 : 0

  name = "${var.name_prefix}-vpc-flow-logs-policy"
  role = aws_iam_role.vpc_flow_logs[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Resource = "*"
      }
    ]
  })
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  count = var.enable_flow_logs ? 1 : 0

  vpc_id          = aws_vpc.main.id
  traffic_type    = "ALL"
  iam_role_arn    = aws_iam_role.vpc_flow_logs[0].arn
  log_destination = aws_cloudwatch_log_group.vpc_flow_logs[0].arn

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-vpc-flow-logs"
    }
  )
}
