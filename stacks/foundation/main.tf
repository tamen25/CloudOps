#Foundation stack — closes backlog #16 (layer 1 of 3).
#
#Owns: bootstrap, dns, codeartifact, networking, database, compliance, backup.
#Provider scope: aws + random only — no kubernetes/helm here, so this
#stack plans cleanly against any environment without a cluster.

data "aws_caller_identity" "current" {}

#Groups local values used by this Terraform file.
locals {
  name_prefix      = var.project_name
  eks_cluster_name = "${var.project_name}-${var.environment}-cluster"
  account_id       = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
    Stack       = "foundation"
  }
}

#Wires the bootstrap module into this stack.
module "bootstrap" {
  count  = var.destroy_all ? 0 : 1
  source = "../../modules/bootstrap"

  environment  = var.environment
  project_name = var.project_name
  owner        = var.owner

  bucket_name = var.bootstrap_bucket_name

  create_kms          = var.bootstrap_create_kms
  kms_deletion_window = var.bootstrap_kms_deletion_window

  additional_trusted_arns = var.bootstrap_additional_trusted_arns
  require_mfa             = var.bootstrap_require_mfa
  external_id             = var.bootstrap_external_id
  max_session_duration    = var.bootstrap_max_session_duration
  additional_policy_arns  = var.bootstrap_additional_policy_arns

  github_token = var.github_token
  github_repo  = var.security_github_repo
}

#Wires the DNS module into this stack.
module "dns" {
  count  = var.destroy_all ? 0 : 1
  source = "../../modules/dns"

  domain_name = var.domain_name
  environment = var.environment
  tags        = local.common_tags
}

#Wires the codeartifact module into this stack.
module "codeartifact" {
  count  = var.enable_codeartifact ? 1 : 0
  source = "../../modules/codeartifact"

  domain_name      = var.codeartifact_domain_name != "" ? var.codeartifact_domain_name : lower("${var.project_name}-${var.environment}")
  repository_names = var.codeartifact_repository_names
  kms_key_arn      = var.codeartifact_kms_key_arn

  tags = local.common_tags
}

#Wires the networking module into this stack.
module "networking" {
  count  = var.enable_networking ? 1 : 0
  source = "../../modules/networking"

  environment = var.environment
  name_prefix = local.name_prefix
  az_count    = var.az_count

  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  db_subnet_cidrs      = var.db_subnet_cidrs

  enable_nat_gateway = var.enable_nat_gateway

  enable_flow_logs         = var.enable_flow_logs
  flow_logs_retention_days = var.flow_logs_retention_days
  flow_logs_destination    = var.flow_logs_destination
  aws_account_id           = local.account_id
  buckets_force_destroy    = var.buckets_force_destroy

  allowed_cidr_blocks = var.allowed_cidr_blocks
  enable_https        = var.enable_https
  enable_http         = var.enable_http
  custom_alb_ports    = var.custom_alb_ports
  rds_port            = var.rds_port

  eks_cluster_name = local.eks_cluster_name

  tags = local.common_tags
}

#Wires the database module into this stack.
module "database" {
  count  = var.enable_database ? 1 : 0
  source = "../../modules/database"

  environment = var.environment
  name_prefix = local.name_prefix

  db_subnet_group_name  = var.enable_networking ? module.networking[0].db_subnet_group_name : ""
  rds_security_group_id = var.enable_networking ? module.networking[0].rds_sg_id : ""

  engine                = var.database_engine
  engine_version        = var.database_engine_version
  instance_class        = var.database_instance_class
  allocated_storage     = var.database_allocated_storage
  max_allocated_storage = var.database_max_allocated_storage
  database_name         = var.database_name
  database_port         = var.database_port

  multi_az            = var.database_multi_az
  create_read_replica = var.database_create_read_replica

  backup_retention_period = var.database_backup_retention_period
  skip_final_snapshot     = var.database_skip_final_snapshot

  deletion_protection = var.database_deletion_protection
  storage_encrypted   = true

  performance_insights_enabled = var.database_performance_insights_enabled
  monitoring_interval          = var.database_monitoring_interval

  rotation_enabled                  = var.database_rotation_enabled
  rotation_lambda_arn               = var.database_rotation_lambda_arn
  rotation_lambda_auto_deploy       = var.database_rotation_lambda_auto_deploy
  rotation_lambda_subnet_ids        = var.enable_networking ? module.networking[0].private_subnet_ids : []
  rotation_lambda_security_group_id = var.enable_networking ? module.networking[0].rds_sg_id : ""
  rotation_days                     = var.database_rotation_days
  secret_recovery_window_days       = var.database_secret_recovery_window_days

  log_connections               = var.database_log_connections
  log_disconnections            = var.database_log_disconnections
  log_duration                  = var.database_log_duration
  log_statement                 = var.database_log_statement
  log_min_duration_statement_ms = var.database_log_min_duration_statement_ms

  tags = local.common_tags
}

#Wires the compliance module into this stack.
module "compliance" {
  count  = var.enable_compliance ? 1 : 0
  source = "../../modules/compliance"

  name_prefix    = local.name_prefix
  aws_account_id = local.account_id

  enable_cloudtrail                     = var.enable_cloudtrail
  cloudtrail_object_lock_enabled        = var.cloudtrail_object_lock_enabled
  cloudtrail_object_lock_retention_days = var.cloudtrail_object_lock_retention_days
  cloudtrail_buckets_force_destroy      = var.buckets_force_destroy

  enable_guardduty             = var.enable_guardduty
  guardduty_eks_protection     = var.guardduty_eks_protection
  guardduty_s3_protection      = var.guardduty_s3_protection
  guardduty_malware_protection = var.guardduty_malware_protection

  enable_config            = var.enable_config
  config_conformance_packs = var.config_conformance_packs

  enable_security_hub    = var.enable_security_hub
  security_hub_standards = var.security_hub_standards

  tags = local.common_tags
}

#Wires the backup module into this stack.
module "backup" {
  count  = var.enable_backup ? 1 : 0
  source = "../../modules/backup"

  name_prefix = local.name_prefix

  rds_instance_arns = var.enable_database ? [module.database[0].rds_arn] : []

  vault_lock_enabled            = var.backup_vault_lock_enabled
  vault_lock_min_retention_days = var.backup_vault_lock_min_retention_days
  vault_lock_max_retention_days = var.backup_vault_lock_max_retention_days

  daily_retention_days   = var.backup_daily_retention_days
  weekly_retention_days  = var.backup_weekly_retention_days
  monthly_retention_days = var.backup_monthly_retention_days

  tags = local.common_tags
}
