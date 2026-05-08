# Foundation outputs — consumed by `cluster` and `platform` stacks via
# terraform_remote_state. Closes backlog #16.

# ── Bootstrap ────────────────────────────────────────────────────────────────
output "bootstrap_bucket_name" {
  value = var.destroy_all ? null : module.bootstrap[0].bucket_name
}

output "bootstrap_kms_key_arn" {
  value = var.destroy_all ? null : (var.bootstrap_create_kms ? module.bootstrap[0].kms_key_arn : null)
}

output "github_token_secret_arn" {
  description = "Secrets Manager ARN of the bootstrap-managed GitHub PAT (empty when github_token is unset)."
  value       = var.destroy_all || var.github_token == "" ? "" : module.bootstrap[0].github_token_secret_arn
  sensitive   = true
}

# ── DNS ──────────────────────────────────────────────────────────────────────
output "route53_zone_id" {
  value = !var.destroy_all ? module.dns[0].zone_id : null
}

output "route53_name_servers" {
  value = !var.destroy_all ? module.dns[0].name_servers : null
}

# ── Networking ───────────────────────────────────────────────────────────────
output "codeartifact_domain_name" {
  value = var.enable_codeartifact ? module.codeartifact[0].domain_name : ""
}

output "codeartifact_repository_names" {
  value = var.enable_codeartifact ? module.codeartifact[0].repository_names : {}
}

output "codeartifact_repository_arns" {
  value = var.enable_codeartifact ? module.codeartifact[0].repository_arns : {}
}

output "vpc_id" {
  value = var.enable_networking ? module.networking[0].vpc_id : null
}

output "vpc_cidr" {
  value = var.vpc_cidr
}

output "public_subnet_ids" {
  value = var.enable_networking ? module.networking[0].public_subnet_ids : []
}

output "private_subnet_ids" {
  value = var.enable_networking ? module.networking[0].private_subnet_ids : []
}

output "db_subnet_group_name" {
  value = var.enable_networking ? module.networking[0].db_subnet_group_name : ""
}

output "db_subnet_cidrs" {
  value = var.enable_networking ? module.networking[0].db_subnet_cidrs : []
}

output "alb_sg_id" {
  value = var.enable_networking ? module.networking[0].alb_sg_id : ""
}

output "eks_nodes_sg_id" {
  value = var.enable_networking ? module.networking[0].eks_nodes_sg_id : ""
}

output "rds_sg_id" {
  value = var.enable_networking ? module.networking[0].rds_sg_id : ""
}

# ── Database ─────────────────────────────────────────────────────────────────
output "rds_instance_id" {
  value = var.enable_database ? module.database[0].rds_instance_id : ""
}

output "rds_arn" {
  value = var.enable_database ? module.database[0].rds_arn : ""
}

output "database_secret_arn" {
  value = var.enable_database ? module.database[0].rds_secret_arn : ""
}

# ── EKS-name passthrough — needed by cluster + platform for tag/IAM scoping ──
output "eks_cluster_name" {
  value = local.eks_cluster_name
}

output "name_prefix" {
  value = local.name_prefix
}

output "account_id" {
  value = local.account_id
}
