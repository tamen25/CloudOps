#Elastic IPs for NAT Gateways (one per AZ for HA)
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

#NAT Gateways for private subnet internet access (one per AZ)
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
