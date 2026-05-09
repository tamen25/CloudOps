#This file defines main settings for CloudOps.
#CloudOps - Root Configuration
#Main Terraform configuration to deploy all modules with toggle controls

data "aws_caller_identity" "current" {}

#Toggle dependency guard — fails plan early when module flags conflict.
#Closes backlog #19. Rules live here (not in module variable blocks) so the
#error names every offending root flag together instead of one at a time.
resource "terraform_data" "toggle_guard" {
  input = {
    enable_eks              = var.enable_eks
    enable_networking       = var.enable_networking
    enable_ingress          = var.enable_ingress
    enable_observability    = var.enable_observability
    enable_security         = var.enable_security
    enable_slo              = var.enable_slo
    enable_self_healing     = var.enable_self_healing
    enable_yace             = var.enable_yace
    enable_alertmanager     = var.enable_alertmanager
    enable_external_secrets = var.enable_external_secrets
    enable_backup           = var.enable_backup
    enable_database         = var.enable_database
    enable_waf              = var.enable_waf
  }

  lifecycle {
    precondition {
      condition     = !var.enable_ingress || var.enable_eks
      error_message = "enable_ingress=true requires enable_eks=true (LBC IRSA needs the cluster's OIDC provider)."
    }

    precondition {
      condition = (
        !var.enable_ingress ||
        var.enable_networking ||
        (var.existing_vpc_id != "" && length(var.existing_private_subnet_ids) > 0 && length(var.existing_public_subnet_ids) > 0)
      )
      error_message = "enable_ingress=true requires either enable_networking=true OR existing_vpc_id + existing_private_subnet_ids + existing_public_subnet_ids."
    }

    precondition {
      condition     = !var.enable_observability || (var.enable_eks && var.enable_ingress)
      error_message = "enable_observability=true requires enable_eks=true AND enable_ingress=true (Grafana/Loki/Tempo ingresses need the ACM cert from the ingress module)."
    }

    precondition {
      condition     = !var.enable_security || (var.enable_eks && var.enable_observability)
      error_message = "enable_security=true requires enable_eks=true AND enable_observability=true (Falco routes to OTel collector; otel_api_key comes from observability)."
    }

    precondition {
      condition     = !var.enable_slo || var.enable_observability || var.slo_prometheus_url != ""
      error_message = "enable_slo=true requires enable_observability=true OR slo_prometheus_url set to an external Prometheus/Grafana proxy URL."
    }

    precondition {
      condition     = !var.enable_self_healing || (var.enable_eks && var.enable_observability)
      error_message = "enable_self_healing=true requires enable_eks=true AND enable_observability=true (CloudWatch alarms need observability metrics + EKS for k8s rollback)."
    }

    precondition {
      condition     = !var.enable_yace || var.enable_observability
      error_message = "enable_yace=true requires enable_observability=true (yace publishes a ServiceMonitor consumed by kube-prometheus-stack)."
    }

    precondition {
      condition     = !var.enable_alertmanager || var.enable_observability
      error_message = "enable_alertmanager=true requires enable_observability=true (Alertmanager is part of the kube-prometheus-stack release)."
    }

    precondition {
      condition     = !var.enable_external_secrets || var.enable_eks
      error_message = "enable_external_secrets=true requires enable_eks=true (ESO is a Helm release into the cluster)."
    }

    precondition {
      condition     = !var.enable_backup || var.enable_database
      error_message = "enable_backup=true requires enable_database=true today (backup plan selection currently only includes the RDS instance ARN)."
    }

    precondition {
      condition     = !var.enable_waf || var.enable_ingress
      error_message = "enable_waf=true requires enable_ingress=true (WAFv2 ACL associates with the ALB created by the LBC)."
    }

    precondition {
      condition     = !(var.self_healing_alb_arn_suffix != "" && var.self_healing_target_group_arn_suffix == "")
      error_message = "self_healing_alb_arn_suffix is set but self_healing_target_group_arn_suffix is empty — ALB-backed alarms need both dimensions or neither."
    }

    precondition {
      condition     = !(var.self_healing_target_group_arn_suffix != "" && var.self_healing_alb_arn_suffix == "")
      error_message = "self_healing_target_group_arn_suffix is set but self_healing_alb_arn_suffix is empty — ALB-backed alarms need both dimensions or neither."
    }

    precondition {
      condition     = !var.database_rotation_enabled || var.database_rotation_lambda_arn != "" || var.database_rotation_lambda_auto_deploy
      error_message = "database_rotation_enabled=true requires either database_rotation_lambda_arn set OR database_rotation_lambda_auto_deploy=true."
    }

    precondition {
      condition     = !(var.buckets_replication_destination_arn != "" && var.buckets_replication_role_arn == "")
      error_message = "buckets_replication_destination_arn requires buckets_replication_role_arn (S3 CRR needs an IAM role with s3:Replicate*)."
    }

    precondition {
      condition     = !(var.buckets_replication_destination_arn != "" && !var.buckets_versioning)
      error_message = "buckets_replication_destination_arn requires buckets_versioning=true (S3 CRR requires versioning enabled)."
    }

    #Closes backlog #28 — base-infra inputs.
    precondition {
      condition = (
        !var.enable_eks ||
        var.enable_networking ||
        (
          var.existing_vpc_id != "" &&
          length(var.existing_private_subnet_ids) > 0 &&
          length(var.existing_public_subnet_ids) > 0 &&
          var.existing_node_sg_id != ""
        )
      )
      error_message = "enable_eks=true with enable_networking=false requires existing_vpc_id + existing_private_subnet_ids + existing_public_subnet_ids + existing_node_sg_id."
    }

    precondition {
      condition     = !var.enable_database || var.enable_networking
      error_message = "enable_database=true requires enable_networking=true today (the database module reads the DB subnet group + RDS security group from the networking module — bring-your-own networking for RDS is not yet wired through). To run RDS against existing infra, extend modules/database to accept explicit db_subnet_group_name + rds_security_group_id at the root level first."
    }
  }
}

#Groups local values used by this Terraform file.
locals {
  name_prefix = var.project_name

  #Derived at root so both networking (subnet tags) and EKS module agree on the name
  eks_cluster_name = "${var.project_name}-${var.environment}-cluster"

  #Use explicit var if provided, otherwise fall back to the current caller identity
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id

  #GitHub token secret ARN resolution:
  #1. If github_token (raw PAT) is provided, bootstrap creates the secret → use its ARN
  #2. Else fall back to the explicitly supplied security_github_token_secret_arn
  #3. If neither is provided, security module disables GitHub issue creation
  github_token_secret_arn = var.github_token != "" ? module.bootstrap[0].github_token_secret_arn : var.security_github_token_secret_arn

  #Order-api Secrets Manager scoping (closes backlog #22). Built from the
  #deterministic DB-credentials secret name + the optional API-key ARN. Pattern
  #uses the `-*` wildcard because Secrets Manager appends a 6-char suffix.
  order_api_db_secret_arn_pattern = "arn:aws:secretsmanager:${var.region}:${local.account_id}:secret:${local.name_prefix}-db-credentials-*"
  order_api_secret_arns = compact(concat(
    var.enable_database ? [local.order_api_db_secret_arn_pattern] : [],
    var.order_api_api_key_secret_arn != "" ? [var.order_api_api_key_secret_arn] : [],
  ))

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
  }
}

#Bootstrap Module (Always Deployed - Required for Remote State)
#NOTE: Run ./modules/bootstrap/create-s3-bucket.sh BEFORE terraform apply

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

  #Raw GitHub PAT — bootstrap stores it in Secrets Manager so the ARN can be
  #passed to the security module without duplicating secret management.
  github_token = var.github_token
  github_repo  = var.security_github_repo
}

#DNS Module — hosted zone for var.domain_name
#Kept alive independently of other modules; only destroyed when destroy_all = true.
#After first apply, update registrar nameservers to the route53_name_servers output.

module "dns" {
  count  = var.destroy_all ? 0 : 1
  source = "./modules/dns"

  domain_name = var.domain_name
  environment = var.environment
  tags        = local.common_tags
}

#Wires the codeartifact module into this stack.
module "codeartifact" {
  count  = var.enable_codeartifact ? 1 : 0
  source = "./modules/codeartifact"

  domain_name      = var.codeartifact_domain_name != "" ? var.codeartifact_domain_name : lower("${var.project_name}-${var.environment}")
  repository_names = var.codeartifact_repository_names
  kms_key_arn      = var.codeartifact_kms_key_arn

  tags = local.common_tags
}

#Networking Module

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

#EKS Module

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
  node_capacity_type  = var.eks_node_capacity_type

  order_api_namespace       = var.order_api_namespace
  order_api_service_account = var.order_api_service_account
  order_api_secret_arns     = local.order_api_secret_arns

  #Control-plane endpoint (backlog #42)
  endpoint_private_access      = var.eks_endpoint_private_access
  endpoint_public_access       = var.eks_endpoint_public_access
  endpoint_public_access_cidrs = var.eks_endpoint_public_access_cidrs

  tags = local.common_tags
}

#Ingress Module (ACM, Route 53, AWS Load Balancer Controller)
#Requires EKS cluster to exist — apply with enable_eks=true before setting enable_ingress=true.

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

  zone_id     = !var.destroy_all ? module.dns[0].zone_id : ""
  domain_name = var.domain_name

  #Set these after the LBC has provisioned the ALB (leave empty on first deploy).
  #cloudops group: api.<domain> + grafana.<domain> (shared public ALB).
  #cloudops-otel group: otel.<domain> (separate ALB, gRPC traceport).
  alb_dns_name      = var.alb_dns_name
  alb_zone_id       = var.alb_zone_id
  otel_alb_dns_name = var.otel_alb_dns_name
  otel_alb_zone_id  = var.otel_alb_zone_id

  #WAFv2
  enable_waf              = var.enable_waf
  waf_rate_limit_per_5min = var.waf_rate_limit_per_5min
  waf_geo_block_countries = var.waf_geo_block_countries
  waf_logging_enabled     = var.waf_logging_enabled

  tags = local.common_tags
}

#Observability Module (LGTM stack — Loki, Grafana, Tempo, Mimir-less Prometheus)
#Requires: enable_eks=true + enable_ingress=true applied first.
#Deploy order: 1) eks, 2) ingress, 3) observability

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

  acm_cert_arn          = var.enable_ingress ? module.ingress[0].certificate_arn : ""
  domain                = var.domain_name
  application_namespace = var.order_api_namespace

  #Grafana unified alerting — contact points + notification policies.
  #Leave all three empty to run without any Grafana alert notifications.
  alert_email         = var.security_alert_email
  alert_sns_topic_arn = var.enable_self_healing ? module.self_healing[0].sns_topic_arn : ""
  alert_webhook_url   = var.grafana_alert_webhook_url

  enable_alertmanager = var.enable_alertmanager
  enable_yace         = var.enable_yace

  #OTel hardening (backlog #38)
  otel_ingestion_internal  = var.otel_ingestion_internal
  otel_allowed_cidrs       = var.otel_allowed_cidrs
  otel_rate_limit_per_5min = var.otel_rate_limit_per_5min
  otel_token_rotation_days = var.otel_token_rotation_days
  otel_alb_dns_name        = var.otel_alb_dns_name

  #Bucket hardening (defaults dev-friendly; flip via prod tfvars)
  buckets_force_destroy               = var.buckets_force_destroy
  buckets_versioning                  = var.buckets_versioning
  buckets_kms_cmk                     = var.buckets_kms_cmk
  buckets_replication_destination_arn = var.buckets_replication_destination_arn
  buckets_replication_role_arn        = var.buckets_replication_role_arn
  buckets_glacier_transition_days     = var.buckets_glacier_transition_days
  buckets_expiration_days             = var.buckets_expiration_days

  #HA replicas
  loki_replication_factor         = var.loki_replication_factor
  loki_write_replicas             = var.loki_write_replicas
  loki_read_replicas              = var.loki_read_replicas
  prometheus_replicas             = var.prometheus_replicas
  prometheus_retention            = var.prometheus_retention
  tempo_ingester_replicas         = var.tempo_ingester_replicas
  tempo_metrics_generator_enabled = var.tempo_metrics_generator_enabled

  #Long-term metrics storage backend (none|mimir|thanos)
  metrics_long_term_storage = var.metrics_long_term_storage

  #Backlog #61 — opt-in OTel SSM publishing.
  publish_otel_ssm_config = var.publish_otel_ssm_config
  ssm_kms_key_id          = var.ssm_kms_key_id

  tags = local.common_tags
}

#SLO Module — Lambda error budget tracker + DynamoDB history
#Requires: enable_observability=true (Prometheus URL comes from that module)
#Deploy order: after observability

module "slo" {
  count  = var.enable_slo ? 1 : 0
  source = "./modules/slo"

  project_name = var.project_name
  environment  = var.environment

  prometheus_url = var.enable_observability ? module.observability[0].prometheus_url : var.slo_prometheus_url
  grafana_url    = var.enable_observability ? module.observability[0].grafana_url : ""

  #When observability is enabled, use the auto-created service account token ARN.
  #When observability is disabled (bring-your-own Prometheus), fall back to the
  #manually supplied var (slo_grafana_api_key_secret_arn in terraform.tfvars).
  grafana_api_key_secret_arn = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : var.slo_grafana_api_key_secret_arn

  tags = local.common_tags
}

#Security Module (Falco runtime threat detection + compliance scanner + kube-bench)
#Installs Falco as a DaemonSet with eBPF driver. Falcosidekick routes findings
#into the OTel Collector log pipeline → Loki → Grafana.
#Compliance scanner Lambda runs every 6 hours: S3, RDS, EKS, IAM, SG, Secrets.
#kube-bench CronJob runs daily at 03:00 UTC with EKS 1.4 CIS benchmark.
#Requires: enable_eks=true + enable_observability=true applied first.
#Deploy order: after observability

module "security" {
  count  = var.enable_security ? 1 : 0
  source = "./modules/security"

  eks_cluster_name = local.eks_cluster_name
  otel_api_key     = var.enable_observability ? module.observability[0].otel_api_key : ""
  environment      = var.environment
  project_name     = var.project_name

  aws_account_id = local.account_id
  region         = var.region
  #Closes backlog #32 — pass the effective DB subnet CIDRs from networking
  #(caller's input or auto-generated). The legacy `var.db_subnet_cidrs ?? []`
  #fallback would silently drop the order-api → RDS NetworkPolicy egress
  #rule once VPC CNI enforcement (backlog #26) is on, breaking 5432.
  db_subnet_cidrs = (
    var.enable_networking
    ? module.networking[0].db_subnet_cidrs
    : (var.db_subnet_cidrs != null ? var.db_subnet_cidrs : [])
  )
  vpc_cidr = var.vpc_cidr

  #Compliance scanner inputs
  vpc_id          = var.enable_networking ? module.networking[0].vpc_id : var.existing_vpc_id
  rds_instance_id = var.enable_database ? module.database[0].rds_instance_id : ""

  #S3 buckets to audit — fall back to empty string (check skipped) when module not deployed
  state_bucket_name = var.bootstrap_bucket_name
  loki_bucket_name  = var.enable_observability ? module.observability[0].loki_bucket : ""
  tempo_bucket_name = var.enable_observability ? module.observability[0].tempo_bucket : ""

  security_alert_email    = var.security_alert_email
  security_critical_email = var.security_critical_email

  #GitHub token secret ARN: prefer the bootstrap-managed secret (created from
  #var.github_token); fall back to an explicitly provided ARN.
  github_token_secret_arn = local.github_token_secret_arn
  github_repo             = var.security_github_repo

  application_namespace = var.order_api_namespace

  oidc_provider_arn = var.enable_eks ? module.eks[0].oidc_provider_arn : ""
  oidc_provider_url = var.enable_eks ? module.eks[0].oidc_provider_url : ""

  enable_external_secrets       = var.enable_external_secrets
  external_secrets_allowed_arns = var.external_secrets_allowed_arns

  tags = local.common_tags

  #Observability must be applied first — security reads the otel-auth secret
  #from the monitoring namespace which is created by the observability stack.
  depends_on = [module.observability]
}

#FinOps Module — Cost Explorer ingestion, anomaly detection, AWS Budgets
#Requires no other modules — can be deployed standalone alongside bootstrap.
#Deploy order: any time after bootstrap

module "finops" {
  count  = var.enable_finops ? 1 : 0
  source = "./modules/finops"

  project_name   = var.project_name
  environment    = var.environment
  aws_account_id = local.account_id

  cost_budget_monthly_usd        = var.cost_budget_monthly_usd
  cost_alert_email               = var.cost_alert_email
  cost_anomaly_threshold_percent = var.cost_anomaly_threshold_percent

  #Idle detector inputs — optional, checks are skipped when empty
  eks_cluster_name = var.enable_eks ? local.eks_cluster_name : ""
  rds_instance_id  = var.enable_database ? module.database[0].rds_instance_id : ""

  tags = local.common_tags
}

#Self-Healing Module — CloudWatch Alarm-driven automated remediation
#Triggers: SNS (CloudWatch Alarms) + EventBridge (EKS pod failures)
#Requires: enable_eks=true + enable_observability=true applied first.
#Deploy order: after observability

module "self_healing" {
  count  = var.enable_self_healing ? 1 : 0
  source = "./modules/self_healing"

  project_name   = var.project_name
  environment    = var.environment
  region         = var.region
  aws_account_id = local.account_id

  eks_cluster_name = var.enable_eks ? local.eks_cluster_name : ""
  #Deterministic ID (not computed output) so count expressions inside the module
  #resolve at plan time before the database resource exists.
  rds_instance_id = var.enable_database ? "${local.name_prefix}-db-primary" : ""

  #ALB metric dimensions — populated after first ingress deploy
  alb_arn_suffix          = var.self_healing_alb_arn_suffix
  target_group_arn_suffix = var.self_healing_target_group_arn_suffix

  min_healthy_pods       = var.self_healing_min_healthy_pods
  max_scale_out_pods     = var.self_healing_max_scale_out_pods
  rollback_on_error_rate = var.self_healing_rollback_on_error_rate

  github_token_secret_arn = local.github_token_secret_arn
  github_repo             = var.security_github_repo

  dry_run = var.self_healing_dry_run

  application_namespace = var.order_api_namespace
  application_name      = "order-api"

  tags = local.common_tags
}

#Database Module (RDS PostgreSQL)

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

  #Logging policy (closes backlog #41)
  log_connections               = var.database_log_connections
  log_disconnections            = var.database_log_disconnections
  log_duration                  = var.database_log_duration
  log_statement                 = var.database_log_statement
  log_min_duration_statement_ms = var.database_log_min_duration_statement_ms

  #Secrets Manager hardening
  rotation_enabled                  = var.database_rotation_enabled
  rotation_lambda_arn               = var.database_rotation_lambda_arn
  rotation_lambda_auto_deploy       = var.database_rotation_lambda_auto_deploy
  rotation_lambda_subnet_ids        = var.enable_networking ? module.networking[0].private_subnet_ids : []
  rotation_lambda_security_group_id = var.enable_networking ? module.networking[0].rds_sg_id : ""
  rotation_days                     = var.database_rotation_days
  secret_recovery_window_days       = var.database_secret_recovery_window_days

  tags = local.common_tags
}

#Compliance — CloudTrail / GuardDuty / Config / Security Hub.
#Each toggle is independent; defaults OFF so dev tear-down is not gated by
#org-level audit state. Flip on in prod-test.tfvars to validate the wiring.

module "compliance" {
  count  = var.enable_compliance ? 1 : 0
  source = "./modules/compliance"

  name_prefix    = local.name_prefix
  aws_account_id = local.account_id

  #CloudTrail
  enable_cloudtrail                     = var.enable_cloudtrail
  cloudtrail_object_lock_enabled        = var.cloudtrail_object_lock_enabled
  cloudtrail_object_lock_retention_days = var.cloudtrail_object_lock_retention_days
  cloudtrail_buckets_force_destroy      = var.buckets_force_destroy

  #GuardDuty
  enable_guardduty             = var.enable_guardduty
  guardduty_eks_protection     = var.guardduty_eks_protection
  guardduty_s3_protection      = var.guardduty_s3_protection
  guardduty_malware_protection = var.guardduty_malware_protection

  #Config
  enable_config            = var.enable_config
  config_conformance_packs = var.config_conformance_packs

  #Security Hub
  enable_security_hub    = var.enable_security_hub
  security_hub_standards = var.security_hub_standards

  tags = local.common_tags
}

#AWS Backup vault — covers RDS + tagged EBS volumes.
#vault_lock_enabled is OFF by default. Locked vaults CANNOT be destroyed
#until min_retention_days expires — only enable in real prod.

module "backup" {
  count  = var.enable_backup ? 1 : 0
  source = "./modules/backup"

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
