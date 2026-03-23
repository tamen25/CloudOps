# CloudOps - Root Configuration
# Main Terraform configuration to deploy all modules with toggle controls

data "aws_caller_identity" "current" {}

locals {
  name_prefix = var.project_name

  # Derived at root so both networking (subnet tags) and EKS module agree on the name
  eks_cluster_name = "${var.project_name}-${var.environment}-cluster"

  # Use explicit var if provided, otherwise fall back to the current caller identity
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id

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
}

# Networking Module

module "networking" {
  count  = var.enable_networking ? 1 : 0
  source = "./modules/networking"

  environment    = var.environment
  name_prefix    = local.name_prefix
  primary_region = var.region
  az_count       = var.az_count

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

  vpc_id             = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id
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

# Database Module (RDS PostgreSQL)

module "database" {
  count  = var.enable_database ? 1 : 0
  source = "./modules/database"

  environment = var.environment
  name_prefix = local.name_prefix

  vpc_id                = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id
  db_subnet_ids         = var.enable_networking ? module.networking[0].database_subnet_ids : []
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
