# CloudOps - Root Configuration
# Main Terraform configuration to deploy all modules with toggle controls

# Local Variables

locals {
  name_prefix = var.project_name

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

  # General Configuration
  environment  = var.environment
  project_name = var.project_name
  owner        = var.owner

  # S3 Bucket (created by bash script)
  bucket_name = var.bootstrap_bucket_name

  # KMS Configuration
  create_kms          = var.bootstrap_create_kms
  kms_deletion_window = var.bootstrap_kms_deletion_window

  # IAM Deployer Role Configuration
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

  # Basic Configuration
  environment    = var.environment
  name_prefix    = local.name_prefix
  primary_region = var.region
  az_count       = var.az_count

  # VPC and Subnet Configuration
  vpc_cidr             = var.vpc_cidr
  public_subnet_cidrs  = var.public_subnet_cidrs
  private_subnet_cidrs = var.private_subnet_cidrs
  db_subnet_cidrs      = var.db_subnet_cidrs

  # NAT Gateway Configuration
  enable_nat_gateway = var.enable_nat_gateway

  # VPC Flow Logs
  enable_flow_logs         = var.enable_flow_logs
  flow_logs_retention_days = var.flow_logs_retention_days

  # Security Group Configuration
  allowed_cidr_blocks = var.allowed_cidr_blocks
  enable_https        = var.enable_https
  enable_http         = var.enable_http
  custom_alb_ports    = var.custom_alb_ports
  rds_port            = var.rds_port

  # Tags
  tags = local.common_tags
}

# Compute Module (ECS Fargate)

module "compute" {
  count  = var.enable_compute ? 1 : 0
  source = "./modules/compute"

  # Basic Configuration
  name_prefix = local.name_prefix
  environment = var.environment

  # Networking (depends on networking module)
  vpc_id          = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id
  private_subnets = var.enable_networking ? module.networking[0].private_subnet_ids : var.existing_private_subnet_ids
  public_subnets  = var.enable_networking ? module.networking[0].public_subnet_ids : var.existing_public_subnet_ids
  alb_sg_id       = var.enable_networking ? module.networking[0].alb_sg_id : var.existing_alb_sg_id
  ecs_task_sg_id  = var.enable_networking ? module.networking[0].ecs_tasks_sg_id : var.existing_ecs_task_sg_id

  # Container Configuration
  container_image = var.container_image
  container_port  = var.container_port
  desired_count   = var.desired_count
  cpu             = var.cpu
  memory          = var.memory

  # Autoscaling Configuration
  autoscaling_min_capacity  = var.autoscaling_min_capacity
  autoscaling_max_capacity  = var.autoscaling_max_capacity
  autoscaling_cpu_target    = var.autoscaling_cpu_target
  autoscaling_memory_target = var.autoscaling_memory_target

  # Health Check
  health_check_path = var.health_check_path

  # Tags
  tags = local.common_tags
}
