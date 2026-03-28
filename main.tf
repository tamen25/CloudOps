# CloudOps - Root Configuration
# Main Terraform configuration to deploy all modules with toggle controls

data "aws_caller_identity" "current" {}

locals {
  name_prefix = var.project_name

  # Derived at root so both networking (subnet tags) and EKS module agree on the name
  eks_cluster_name = "${var.project_name}-${var.environment}-cluster"

  # Use explicit var if provided, otherwise fall back to the current caller identity
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id

  # GitHub token secret ARN resolution:
  #   1. If github_token (raw PAT) is provided, bootstrap creates the secret → use its ARN
  #   2. Else fall back to the explicitly supplied security_github_token_secret_arn
  #   3. If neither is provided, security module disables GitHub issue creation
  github_token_secret_arn = var.github_token != "" ? module.bootstrap[0].github_token_secret_arn : var.security_github_token_secret_arn

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
  }
}

# Bootstrap Module (Always Deployed - Required for Remote State)
# NOTE: Run ./modules/bootstrap/create-s3-bucket.sh BEFORE terraform apply

module "bootstrap" {
  count  = var.destroy_all ? 0 : 1
  source = "./modules/bootstrap"

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

  # Raw GitHub PAT — bootstrap stores it in Secrets Manager so the ARN can be
  # passed to the security module without duplicating secret management.
  github_token = var.github_token
}

# Networking Module

module "networking" {
  count  = var.enable_networking ? 1 : 0
  source = "./modules/networking"

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

  allowed_cidr_blocks = var.allowed_cidr_blocks
  enable_https        = var.enable_https
  enable_http         = var.enable_http
  custom_alb_ports    = var.custom_alb_ports
  rds_port            = var.rds_port

  eks_cluster_name = local.eks_cluster_name

  tags = local.common_tags
}

# EKS Module

module "eks" {
  count  = var.enable_eks ? 1 : 0
  source = "./modules/eks"

  name_prefix  = local.name_prefix
  environment  = var.environment
  cluster_name = local.eks_cluster_name

  private_subnet_ids = var.enable_networking ? module.networking[0].private_subnet_ids : var.existing_private_subnet_ids
  public_subnet_ids  = var.enable_networking ? module.networking[0].public_subnet_ids : var.existing_public_subnet_ids
  node_sg_id         = var.enable_networking ? module.networking[0].eks_nodes_sg_id : var.existing_node_sg_id

  kubernetes_version = var.eks_kubernetes_version

  node_instance_types = var.eks_node_instance_types
  node_min_size       = var.eks_node_min_size
  node_max_size       = var.eks_node_max_size
  node_desired_size   = var.eks_node_desired_size

  order_api_namespace       = var.order_api_namespace
  order_api_service_account = var.order_api_service_account

  tags = local.common_tags
}

# Ingress Module (ACM, Route 53, AWS Load Balancer Controller)
# Requires EKS cluster to exist — apply with enable_eks=true before setting enable_ingress=true.

module "ingress" {
  count  = var.enable_ingress ? 1 : 0
  source = "./modules/ingress"

  name_prefix  = local.name_prefix
  environment  = var.environment
  cluster_name = local.eks_cluster_name
  region       = var.region

  vpc_id = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id

  oidc_provider_arn = var.enable_eks ? module.eks[0].oidc_provider_arn : ""
  oidc_provider_url = var.enable_eks ? module.eks[0].oidc_provider_url : ""

  # Set these after the LBC has provisioned the ALB (leave empty on first deploy)
  alb_dns_name = var.alb_dns_name
  alb_zone_id  = var.alb_zone_id

  tags = local.common_tags
}

# Observability Module (LGTM stack — Loki, Grafana, Tempo, Mimir-less Prometheus)
# Requires: enable_eks=true + enable_ingress=true applied first.
# Deploy order: 1) eks, 2) ingress, 3) observability

module "observability" {
  count  = var.enable_observability ? 1 : 0
  source = "./modules/observability"

  name_prefix    = local.name_prefix
  environment    = var.environment
  region         = var.region
  aws_account_id = local.account_id

  eks_cluster_name  = local.eks_cluster_name
  oidc_provider_arn = var.enable_eks ? module.eks[0].oidc_provider_arn : ""
  oidc_provider_url = var.enable_eks ? module.eks[0].oidc_provider_url : ""

  acm_cert_arn = var.enable_ingress ? module.ingress[0].certificate_arn : ""
  domain       = "tamendutta.com"

  alb_dns_name = var.alb_dns_name
  alb_zone_id  = var.alb_zone_id

  tags = local.common_tags
}

# SLO Module — Lambda error budget tracker + DynamoDB history
# Requires: enable_observability=true (Prometheus URL comes from that module)
# Deploy order: after observability

module "slo" {
  count  = var.enable_slo ? 1 : 0
  source = "./modules/slo"

  project_name = var.project_name
  environment  = var.environment

  prometheus_url = var.enable_observability ? module.observability[0].prometheus_url : var.slo_prometheus_url
  grafana_url    = var.enable_observability ? module.observability[0].grafana_url : ""

  # When observability is enabled, use the auto-created service account token ARN.
  # When observability is disabled (bring-your-own Prometheus), fall back to the
  # manually supplied var (slo_grafana_api_key_secret_arn in terraform.tfvars).
  grafana_api_key_secret_arn = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : var.slo_grafana_api_key_secret_arn

  tags = local.common_tags
}

# Security Module (Falco runtime threat detection + compliance scanner + kube-bench)
# Installs Falco as a DaemonSet with eBPF driver. Falcosidekick routes findings
# into the OTel Collector log pipeline → Loki → Grafana.
# Compliance scanner Lambda runs every 6 hours: S3, RDS, EKS, IAM, SG, Secrets.
# kube-bench CronJob runs daily at 03:00 UTC with EKS 1.4 CIS benchmark.
# Requires: enable_eks=true + enable_observability=true applied first.
# Deploy order: after observability

module "security" {
  count  = var.enable_security ? 1 : 0
  source = "./modules/security"

  eks_cluster_name         = local.eks_cluster_name
  otel_api_key_secret_name = "otel-auth"
  environment              = var.environment
  project_name             = var.project_name

  aws_account_id  = local.account_id
  region          = var.region
  db_subnet_cidrs = var.db_subnet_cidrs != null ? var.db_subnet_cidrs : []
  vpc_cidr        = var.vpc_cidr

  # Compliance scanner inputs
  vpc_id          = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id
  rds_instance_id = var.enable_database ? module.database[0].rds_instance_id : ""

  # S3 buckets to audit — fall back to empty string (check skipped) when module not deployed
  state_bucket_name = var.bootstrap_bucket_name
  loki_bucket_name  = var.enable_observability ? module.observability[0].loki_bucket : ""
  tempo_bucket_name = var.enable_observability ? module.observability[0].tempo_bucket : ""

  security_alert_email    = var.security_alert_email
  security_critical_email = var.security_critical_email

  # GitHub token secret ARN: prefer the bootstrap-managed secret (created from
  # var.github_token); fall back to an explicitly provided ARN.
  github_token_secret_arn = local.github_token_secret_arn
  github_repo             = var.security_github_repo

  oidc_provider_arn = var.enable_eks ? module.eks[0].oidc_provider_arn : ""
  oidc_provider_url = var.enable_eks ? module.eks[0].oidc_provider_url : ""

  tags = local.common_tags
}

# FinOps Module — Cost Explorer ingestion, anomaly detection, AWS Budgets
# Requires no other modules — can be deployed standalone alongside bootstrap.
# Deploy order: any time after bootstrap

module "finops" {
  count  = var.enable_finops ? 1 : 0
  source = "./modules/finops"

  project_name   = var.project_name
  environment    = var.environment
  aws_account_id = local.account_id

  cost_budget_monthly_usd        = var.cost_budget_monthly_usd
  cost_alert_email               = var.cost_alert_email
  cost_anomaly_threshold_percent = var.cost_anomaly_threshold_percent

  # Idle detector inputs — optional, checks are skipped when empty
  eks_cluster_name = var.enable_eks ? local.eks_cluster_name : ""
  rds_instance_id  = var.enable_database ? module.database[0].rds_instance_id : ""

  tags = local.common_tags
}

# Self-Healing Module — CloudWatch Alarm-driven automated remediation
# Triggers: SNS (CloudWatch Alarms) + EventBridge (EKS pod failures)
# Requires: enable_eks=true + enable_observability=true applied first.
# Deploy order: after observability

module "self_healing" {
  count  = var.enable_self_healing ? 1 : 0
  source = "./modules/self_healing"

  project_name   = var.project_name
  environment    = var.environment
  region         = var.region
  aws_account_id = local.account_id

  eks_cluster_name = var.enable_eks ? local.eks_cluster_name : ""
  # Deterministic ID (not computed output) so count expressions inside the module
  # resolve at plan time before the database resource exists.
  rds_instance_id = var.enable_database ? "${local.name_prefix}-db-primary" : ""

  # ALB metric dimensions — populated after first ingress deploy
  alb_arn_suffix          = var.self_healing_alb_arn_suffix
  target_group_arn_suffix = var.self_healing_target_group_arn_suffix

  min_healthy_pods       = var.self_healing_min_healthy_pods
  max_scale_out_pods     = var.self_healing_max_scale_out_pods
  rollback_on_error_rate = var.self_healing_rollback_on_error_rate

  github_token_secret_arn = local.github_token_secret_arn
  github_repo             = var.security_github_repo

  dry_run = var.self_healing_dry_run

  tags = local.common_tags
}

# Database Module (RDS PostgreSQL)

module "database" {
  count  = var.enable_database ? 1 : 0
  source = "./modules/database"

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

  tags = local.common_tags
}
