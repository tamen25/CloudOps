# Public subnets for ALB and NAT gateways
resource "aws_subnet" "public" {
  count = local.az_count

  vpc_id                  = aws_vpc.main.id
  cidr_block              = local.public_subnet_cidrs[count.index]
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-public-${local.azs[count.index]}"
      Type = "public"
      Tier = "public"
    }
  )
}

# Private subnets for ECS tasks
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

# Database subnets for RDS (isolated from internet)
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

# DB subnet group required by RDS
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
