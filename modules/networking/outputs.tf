#This file defines outputs settings for CloudOps.
#Networking Module Outputs
#Required by compute module for resource references

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

#Exposes the public subnet ids output value.
output "public_subnet_ids" {
  description = "List of public subnet IDs"
  value       = aws_subnet.public[*].id
}

#Exposes the private subnet ids output value.
output "private_subnet_ids" {
  description = "List of private subnet IDs"
  value       = aws_subnet.private[*].id
}

#Exposes the database subnet ids output value.
output "database_subnet_ids" {
  description = "List of database subnet IDs"
  value       = aws_subnet.database[*].id
}

#Exposes the database subnet group name output value.
output "db_subnet_group_name" {
  description = "Database subnet group name"
  value       = aws_db_subnet_group.main.name
}

#Exposes the database subnet cidrs output value.
output "db_subnet_cidrs" {
  description = "Effective database subnet CIDRs (caller's input or auto-generated from vpc_cidr). Closes backlog #32 — security NetworkPolicy needs the real CIDR list to allow order-api egress to RDS on TCP 5432."
  value       = local.db_subnet_cidrs
}

#Exposes the public subnet cidrs output value.
output "public_subnet_cidrs" {
  description = "Effective public subnet CIDRs (used by NetworkPolicies that need to allow ALB ENI source IPs)."
  value       = local.public_subnet_cidrs
}

#Exposes the private subnet cidrs output value.
output "private_subnet_cidrs" {
  description = "Effective private subnet CIDRs."
  value       = local.private_subnet_cidrs
}

#Exposes the alb sg ID output value.
output "alb_sg_id" {
  description = "ALB security group ID"
  value       = aws_security_group.alb.id
}

#Exposes the EKS nodes sg ID output value.
output "eks_nodes_sg_id" {
  description = "EKS nodes security group ID"
  value       = aws_security_group.eks_nodes.id
}

#Exposes the RDS sg ID output value.
output "rds_sg_id" {
  description = "RDS security group ID"
  value       = aws_security_group.rds.id
}

#Exposes the VPC endpoints sg ID output value.
output "vpc_endpoints_sg_id" {
  description = "VPC endpoints security group ID"
  value       = aws_security_group.vpc_endpoints.id
}
