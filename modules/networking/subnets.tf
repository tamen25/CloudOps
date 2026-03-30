# Public subnets — ALB and NAT gateways; tagged for external load balancer discovery
resource "aws_subnet" "public" {
  #checkov:skip=CKV_AWS_130:Public subnets intentionally assign public IPs - required for ALB nodes
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name                     = "${var.name_prefix}-public-${local.azs[count.index]}"
    Type                     = "public"
    Tier                     = "public"
    "kubernetes.io/role/elb" = "1"
  })
}

# Private subnets — EKS nodes; tagged for internal load balancer discovery
resource "aws_subnet" "private" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.private_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name                                            = "${var.name_prefix}-private-${local.azs[count.index]}"
    Type                                            = "private"
    Tier                                            = "application"
    "kubernetes.io/role/internal-elb"               = "1"
    "kubernetes.io/cluster/${var.eks_cluster_name}" = "shared"
  })
}

# Database subnets — RDS only, no internet route
resource "aws_subnet" "database" {
  count = local.az_count

  vpc_id            = aws_vpc.main.id
  cidr_block        = local.db_subnet_cidrs[count.index]
  availability_zone = local.azs[count.index]

  tags = merge(local.common_tags, {
    Name = "${var.name_prefix}-db-${local.azs[count.index]}"
    Type = "database"
    Tier = "data"
  })
}

# Subnet group referenced by the database module
resource "aws_db_subnet_group" "main" {
  name        = "${var.name_prefix}-db-subnet-group"
  description = "Database subnet group for ${var.name_prefix}"
  subnet_ids  = aws_subnet.database[*].id

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-db-subnet-group" })
}
