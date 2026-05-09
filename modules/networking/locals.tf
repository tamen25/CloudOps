#This file defines locals settings for CloudOps.
#Get all available AZs in the region
data "aws_availability_zones" "available" {
  state = "available"
}

#Get current AWS region
data "aws_region" "current" {}

#Groups local values used by this Terraform file.
locals {
  #Limit AZ count to minimum of var.az_count, available AZs, or 3 (cost optimization)
  az_count = min(var.az_count, length(data.aws_availability_zones.available.names), 3)
  azs      = slice(data.aws_availability_zones.available.names, 0, local.az_count)

  #Auto-generate subnet CIDRs if not provided: 10.0.0.0/24, 10.0.1.0/24, etc.
  public_subnet_cidrs = var.public_subnet_cidrs != null ? var.public_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i)
  ]

  #Private subnets: 10.0.10.0/24, 10.0.11.0/24, etc.
  private_subnet_cidrs = var.private_subnet_cidrs != null ? var.private_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 10)
  ]

  #Database subnets: 10.0.20.0/24, 10.0.21.0/24, etc.
  db_subnet_cidrs = var.db_subnet_cidrs != null ? var.db_subnet_cidrs : [
    for i in range(local.az_count) : cidrsubnet(var.vpc_cidr, 8, i + 20)
  ]

  #Merge user tags with module defaults
  common_tags = merge(
    var.tags,
    {
      Module      = "networking"
      Environment = var.environment
      ManagedBy   = "Terraform"
    }
  )
}
