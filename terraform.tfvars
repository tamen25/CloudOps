# CloudOps — Terraform Variables
# Deploy order:
#   1. bootstrap (always on) + networking
#   2. eks              (requires networking)
#   3. ingress          (requires eks — ACM + LBC + Route 53)
#   4. observability    (requires eks + ingress)
#   5. database         (requires networking; independent of eks)
#   After steps 3–4: set alb_dns_name + alb_zone_id, then re-apply

# ─────────────────────────────────────────────────────────────
# Module Toggles
# ─────────────────────────────────────────────────────────────
enable_networking    = true
enable_eks           = true
enable_database      = true
enable_ingress       = true
enable_observability = true
enable_slo           = true
enable_security      = true
enable_finops        = true
enable_self_healing  = true
destroy_all          = false

# ─────────────────────────────────────────────────────────────
# General
# ─────────────────────────────────────────────────────────────
region       = "us-east-1"
environment  = "dev"
project_name = "cloudops"
owner        = "Tamen"

# Auto-detected at plan time — leave empty
aws_account_id = ""

# ─────────────────────────────────────────────────────────────
# ALB / Route 53  (set after first ingress deploy)
# ─────────────────────────────────────────────────────────────
alb_dns_name = ""
alb_zone_id  = ""

# ─────────────────────────────────────────────────────────────
# Bootstrap
# ─────────────────────────────────────────────────────────────
bootstrap_bucket_name             = "cloudops-tfstate-tamen25"
bootstrap_create_kms              = true
bootstrap_kms_deletion_window     = 30
bootstrap_require_mfa             = false
bootstrap_max_session_duration    = 3600
bootstrap_additional_trusted_arns = []
bootstrap_additional_policy_arns  = []
bootstrap_external_id             = ""

# ─────────────────────────────────────────────────────────────
# Networking
# ─────────────────────────────────────────────────────────────
az_count = 2
vpc_cidr  = "10.0.0.0/16"

public_subnet_cidrs  = null
private_subnet_cidrs = null
db_subnet_cidrs      = null

# Disabled in dev — saves ~$64/month (2 AZs × $32)
enable_nat_gateway       = false
enable_flow_logs         = false
flow_logs_retention_days = 7

allowed_cidr_blocks = ["0.0.0.0/0"]
enable_https        = true
enable_http         = true
custom_alb_ports    = []
rds_port            = 5432

# ─────────────────────────────────────────────────────────────
# EKS
# ─────────────────────────────────────────────────────────────
eks_kubernetes_version    = "1.32"
eks_node_instance_types   = ["t3.large"]
eks_node_min_size         = 2
eks_node_max_size         = 6
eks_node_desired_size     = 2
order_api_namespace       = "cloudops"
order_api_service_account = "order-api"

# Only required if enable_networking = false and enable_eks = true
existing_vpc_id             = ""
existing_private_subnet_ids = []
existing_public_subnet_ids  = []
existing_node_sg_id         = ""

# ─────────────────────────────────────────────────────────────
# Database (RDS PostgreSQL)
# ─────────────────────────────────────────────────────────────
database_instance_class                = "db.t3.micro"
database_allocated_storage             = 20
database_max_allocated_storage         = 100
database_engine                        = "postgres"
database_engine_version                = "15.5"
database_name                          = "cloudops"
database_port                          = 5432
database_multi_az                      = false
database_create_read_replica           = false
database_backup_retention_period       = 7
database_skip_final_snapshot           = true
database_deletion_protection           = false
database_performance_insights_enabled  = true
database_monitoring_interval           = 60

# ─────────────────────────────────────────────────────────────
# SLO
# ─────────────────────────────────────────────────────────────
slo_grafana_api_key_secret_arn = ""
slo_prometheus_url             = ""

# ─────────────────────────────────────────────────────────────
# Security
# ─────────────────────────────────────────────────────────────
security_alert_email             = ""
security_critical_email          = ""
github_token                     = ""
security_github_token_secret_arn = ""
security_github_repo             = "tamen25/CloudOps"

# ─────────────────────────────────────────────────────────────
# Self-Healing
# ─────────────────────────────────────────────────────────────
self_healing_alb_arn_suffix          = ""
self_healing_target_group_arn_suffix = ""
self_healing_min_healthy_pods        = 2
self_healing_max_scale_out_pods      = 10
self_healing_rollback_on_error_rate  = 5
self_healing_dry_run                 = true

# ─────────────────────────────────────────────────────────────
# FinOps
# ─────────────────────────────────────────────────────────────
cost_budget_monthly_usd        = 50
cost_alert_email               = ""
cost_anomaly_threshold_percent = 20
