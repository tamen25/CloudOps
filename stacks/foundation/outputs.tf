#Foundation outputs — consumed by `cluster` and `platform` stacks via
#terraform_remote_state. Closes backlog #16.

#── Bootstrap ────────────────────────────────────────────────────────────────
output "bootstrap_bucket_name" {
  value = var.destroy_all ? null : module.bootstrap[0].bucket_name
}

#Exposes the bootstrap KMS key arn output value.
output "bootstrap_kms_key_arn" {
  value = var.destroy_all ? null : (var.bootstrap_create_kms ? module.bootstrap[0].kms_key_arn : null)
}

output "github_actions_role_arn" {
  description = "Role GitHub Actions assumes through OIDC; the AWS_GITHUB_ACTIONS_ROLE_ARN secret"
  value       = var.destroy_all ? null : module.bootstrap[0].github_actions_role_arn
}

output "deployer_role_arn" {
  description = "Role a person assumes (with MFA) to run Terraform"
  value       = var.destroy_all ? null : module.bootstrap[0].deployer_role_arn
}

#Exposes the github token secret arn output value.
output "github_token_secret_arn" {
  description = "Secrets Manager ARN of the bootstrap-managed GitHub PAT (empty when github_token is unset)."
  value       = var.destroy_all || var.github_token == "" ? "" : module.bootstrap[0].github_token_secret_arn
  sensitive   = true
}

#── DNS ──────────────────────────────────────────────────────────────────────
output "route53_zone_id" {
  value = !var.destroy_all ? module.dns[0].zone_id : null
}

#Exposes the route53 name servers output value.
output "route53_name_servers" {
  value = !var.destroy_all ? module.dns[0].name_servers : null
}

#── Networking ───────────────────────────────────────────────────────────────
output "codeartifact_domain_name" {
  value = var.enable_codeartifact ? module.codeartifact[0].domain_name : ""
}

#Exposes the codeartifact repository names output value.
output "codeartifact_repository_names" {
  value = var.enable_codeartifact ? module.codeartifact[0].repository_names : {}
}

#Exposes the codeartifact repository arns output value.
output "codeartifact_repository_arns" {
  value = var.enable_codeartifact ? module.codeartifact[0].repository_arns : {}
}

#Exposes the VPC ID output value.
output "vpc_id" {
  value = var.enable_networking ? module.networking[0].vpc_id : null
}

#Exposes the VPC cidr output value.
output "vpc_cidr" {
  value = var.vpc_cidr
}

#Exposes the public subnet ids output value.
output "public_subnet_ids" {
  value = var.enable_networking ? module.networking[0].public_subnet_ids : []
}

#Exposes the private subnet ids output value.
output "private_subnet_ids" {
  value = var.enable_networking ? module.networking[0].private_subnet_ids : []
}

#Exposes the database subnet group name output value.
output "db_subnet_group_name" {
  value = var.enable_networking ? module.networking[0].db_subnet_group_name : ""
}

#Exposes the database subnet cidrs output value.
output "db_subnet_cidrs" {
  value = var.enable_networking ? module.networking[0].db_subnet_cidrs : []
}

#Exposes the alb sg ID output value.
output "alb_sg_id" {
  value = var.enable_networking ? module.networking[0].alb_sg_id : ""
}

#Exposes the EKS nodes sg ID output value.
output "eks_nodes_sg_id" {
  value = var.enable_networking ? module.networking[0].eks_nodes_sg_id : ""
}

#Exposes the RDS sg ID output value.
output "rds_sg_id" {
  value = var.enable_networking ? module.networking[0].rds_sg_id : ""
}

#── Database ─────────────────────────────────────────────────────────────────
output "rds_instance_id" {
  value = var.enable_database ? module.database[0].rds_instance_id : ""
}

#Exposes the RDS arn output value.
output "rds_arn" {
  value = var.enable_database ? module.database[0].rds_arn : ""
}

#Exposes the database secret arn output value.
output "database_secret_arn" {
  value = var.enable_database ? module.database[0].rds_secret_arn : ""
}

output "database_endpoint" {
  description = "Primary RDS endpoint (host:port)"
  value       = var.enable_database ? module.database[0].rds_endpoint : ""
}

#── EKS-name passthrough — needed by cluster + platform for tag/IAM scoping ──
output "eks_cluster_name" {
  value = local.eks_cluster_name
}

#Exposes the name prefix output value.
output "name_prefix" {
  value = local.name_prefix
}

#Exposes the account ID output value.
output "account_id" {
  value = local.account_id
}

output "permissions_boundary_arn" {
  description = "Workload permissions boundary, put on every role the cluster and platform stacks create (null while it is off)"
  value       = local.permissions_boundary_arn
}

output "ecr_repository_urls" {
  description = "ECR repository URL by image name; order-api's is the ECR_REPOSITORY_URL secret"
  value       = var.destroy_all ? {} : module.ecr[0].repository_urls
}
