# Platform stack - layer 3 of the split Terraform layout.
#
# Owns Kubernetes-facing platform services plus adjacent AWS automation:
# ingress, observability, security, SLO, FinOps, and self-healing.
# Reads foundation and cluster outputs through terraform_remote_state.

data "aws_caller_identity" "current" {}

resource "terraform_data" "toggle_guard" {
  input = {
    destroy_all                          = var.destroy_all
    enable_networking                    = var.enable_networking
    enable_eks                           = var.enable_eks
    enable_database                      = var.enable_database
    enable_ingress                       = var.enable_ingress
    enable_observability                 = var.enable_observability
    enable_security                      = var.enable_security
    enable_slo                           = var.enable_slo
    enable_finops                        = var.enable_finops
    enable_self_healing                  = var.enable_self_healing
    enable_yace                          = var.enable_yace
    enable_alertmanager                  = var.enable_alertmanager
    enable_external_secrets              = var.enable_external_secrets
    enable_waf                           = var.enable_waf
    self_healing_alb_arn_suffix          = var.self_healing_alb_arn_suffix
    self_healing_target_group_arn_suffix = var.self_healing_target_group_arn_suffix
  }

  lifecycle {
    precondition {
      condition     = !var.enable_observability || var.enable_ingress
      error_message = "enable_observability=true requires enable_ingress=true in the platform stack."
    }

    precondition {
      condition     = !var.enable_security || var.enable_observability
      error_message = "enable_security=true requires enable_observability=true."
    }

    precondition {
      condition     = !var.enable_self_healing || var.enable_observability
      error_message = "enable_self_healing=true requires enable_observability=true because it installs a Grafana dashboard into the monitoring namespace."
    }

    precondition {
      condition     = !var.enable_slo || var.enable_observability || var.slo_prometheus_url != ""
      error_message = "enable_slo=true requires enable_observability=true OR slo_prometheus_url set to an external Prometheus/Grafana proxy URL."
    }

    precondition {
      condition     = !var.enable_yace || var.enable_observability
      error_message = "enable_yace=true requires enable_observability=true."
    }

    precondition {
      condition     = !var.enable_alertmanager || var.enable_observability
      error_message = "enable_alertmanager=true requires enable_observability=true."
    }

    precondition {
      condition     = !var.enable_waf || var.enable_ingress
      error_message = "enable_waf=true requires enable_ingress=true."
    }

    precondition {
      condition     = !(var.self_healing_alb_arn_suffix != "" && var.self_healing_target_group_arn_suffix == "")
      error_message = "self_healing_alb_arn_suffix is set but self_healing_target_group_arn_suffix is empty."
    }

    precondition {
      condition     = !(var.self_healing_target_group_arn_suffix != "" && var.self_healing_alb_arn_suffix == "")
      error_message = "self_healing_target_group_arn_suffix is set but self_healing_alb_arn_suffix is empty."
    }

    precondition {
      condition     = !(var.buckets_replication_destination_arn != "" && var.buckets_replication_role_arn == "")
      error_message = "buckets_replication_destination_arn requires buckets_replication_role_arn."
    }

    precondition {
      condition     = !(var.buckets_replication_destination_arn != "" && !var.buckets_versioning)
      error_message = "buckets_replication_destination_arn requires buckets_versioning=true."
    }
  }
}

locals {
  foundation = var.use_remote_state_foundation ? data.terraform_remote_state.foundation[0].outputs : null
  cluster    = var.use_remote_state_cluster ? data.terraform_remote_state.cluster[0].outputs : null

  name_prefix = var.use_remote_state_foundation ? local.foundation.name_prefix : var.project_name
  account_id = (
    var.aws_account_id != ""
    ? var.aws_account_id
    : (var.use_remote_state_foundation ? local.foundation.account_id : data.aws_caller_identity.current.account_id)
  )

  vpc_id = (
    var.use_remote_state_foundation
    ? local.foundation.vpc_id
    : var.existing_vpc_id
  )
  vpc_cidr = (
    var.use_remote_state_foundation
    ? local.foundation.vpc_cidr
    : var.vpc_cidr
  )
  db_subnet_cidrs = (
    var.use_remote_state_foundation
    ? local.foundation.db_subnet_cidrs
    : var.existing_db_subnet_cidrs
  )
  route53_zone_id = (
    var.use_remote_state_foundation
    ? local.foundation.route53_zone_id
    : var.existing_route53_zone_id
  )
  rds_instance_id = (
    var.use_remote_state_foundation
    ? local.foundation.rds_instance_id
    : var.existing_rds_instance_id
  )
  bootstrap_bucket_name = (
    var.use_remote_state_foundation
    ? local.foundation.bootstrap_bucket_name
    : var.bootstrap_bucket_name
  )
  github_token_secret_arn = (
    var.use_remote_state_foundation && try(local.foundation.github_token_secret_arn, "") != ""
    ? local.foundation.github_token_secret_arn
    : var.security_github_token_secret_arn
  )

  eks_cluster_name = (
    var.use_remote_state_cluster
    ? local.cluster.cluster_name
    : var.existing_cluster_name
  )
  cluster_endpoint = (
    var.use_remote_state_cluster
    ? local.cluster.cluster_endpoint
    : var.existing_cluster_endpoint
  )
  cluster_ca_certificate = (
    var.use_remote_state_cluster
    ? local.cluster.cluster_ca_certificate
    : var.existing_cluster_ca_certificate
  )
  oidc_provider_arn = (
    var.use_remote_state_cluster
    ? local.cluster.oidc_provider_arn
    : var.existing_oidc_provider_arn
  )
  oidc_provider_url = (
    var.use_remote_state_cluster
    ? local.cluster.oidc_provider_url
    : var.existing_oidc_provider_url
  )

  grafana_alert_contact_marker = var.grafana_alert_webhook_url != "" ? "webhook-configured" : ""

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
    Stack       = "platform"
  }
}

module "ingress" {
  count  = var.enable_ingress ? 1 : 0
  source = "../../modules/ingress"

  name_prefix  = local.name_prefix
  environment  = var.environment
  cluster_name = local.eks_cluster_name
  region       = var.region

  vpc_id = local.vpc_id

  oidc_provider_arn = local.oidc_provider_arn
  oidc_provider_url = local.oidc_provider_url

  zone_id     = local.route53_zone_id
  domain_name = var.domain_name

  alb_dns_name      = var.alb_dns_name
  alb_zone_id       = var.alb_zone_id
  otel_alb_dns_name = var.otel_alb_dns_name
  otel_alb_zone_id  = var.otel_alb_zone_id

  enable_waf              = var.enable_waf
  waf_rate_limit_per_5min = var.waf_rate_limit_per_5min
  waf_geo_block_countries = var.waf_geo_block_countries
  waf_logging_enabled     = var.waf_logging_enabled

  tags = local.common_tags
}

module "observability" {
  count  = var.enable_observability ? 1 : 0
  source = "../../modules/observability"

  name_prefix    = local.name_prefix
  environment    = var.environment
  region         = var.region
  aws_account_id = local.account_id

  eks_cluster_name  = local.eks_cluster_name
  oidc_provider_arn = local.oidc_provider_arn
  oidc_provider_url = local.oidc_provider_url

  acm_cert_arn          = var.enable_ingress ? module.ingress[0].certificate_arn : ""
  domain                = var.domain_name
  zone_id               = local.route53_zone_id
  application_namespace = var.order_api_namespace

  alb_dns_name = var.alb_dns_name
  alb_zone_id  = var.alb_zone_id

  alert_email         = var.security_alert_email
  alert_sns_topic_arn = local.grafana_alert_contact_marker
  alert_webhook_url   = var.grafana_alert_webhook_url

  enable_alertmanager = var.enable_alertmanager
  enable_yace         = var.enable_yace

  otel_ingestion_internal  = var.otel_ingestion_internal
  otel_allowed_cidrs       = var.otel_allowed_cidrs
  otel_rate_limit_per_5min = var.otel_rate_limit_per_5min
  otel_token_rotation_days = var.otel_token_rotation_days
  otel_alb_dns_name        = var.otel_alb_dns_name

  buckets_force_destroy               = var.buckets_force_destroy
  buckets_versioning                  = var.buckets_versioning
  buckets_kms_cmk                     = var.buckets_kms_cmk
  buckets_replication_destination_arn = var.buckets_replication_destination_arn
  buckets_replication_role_arn        = var.buckets_replication_role_arn
  buckets_glacier_transition_days     = var.buckets_glacier_transition_days
  buckets_expiration_days             = var.buckets_expiration_days

  loki_replication_factor         = var.loki_replication_factor
  loki_write_replicas             = var.loki_write_replicas
  loki_read_replicas              = var.loki_read_replicas
  prometheus_replicas             = var.prometheus_replicas
  prometheus_retention            = var.prometheus_retention
  tempo_ingester_replicas         = var.tempo_ingester_replicas
  tempo_metrics_generator_enabled = var.tempo_metrics_generator_enabled

  metrics_long_term_storage = var.metrics_long_term_storage

  tags = local.common_tags
}

module "slo" {
  count  = var.enable_slo ? 1 : 0
  source = "../../modules/slo"

  project_name = var.project_name
  environment  = var.environment

  prometheus_url = var.enable_observability ? module.observability[0].prometheus_url : var.slo_prometheus_url
  grafana_url    = var.enable_observability ? module.observability[0].grafana_url : ""

  grafana_api_key_secret_arn = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : var.slo_grafana_api_key_secret_arn

  tags = local.common_tags
}

module "security" {
  count  = var.enable_security ? 1 : 0
  source = "../../modules/security"

  eks_cluster_name = local.eks_cluster_name
  otel_api_key     = var.enable_observability ? module.observability[0].otel_api_key : ""
  environment      = var.environment
  project_name     = var.project_name

  aws_account_id = local.account_id
  region         = var.region

  db_subnet_cidrs = local.db_subnet_cidrs
  vpc_cidr        = local.vpc_cidr

  vpc_id          = local.vpc_id
  rds_instance_id = local.rds_instance_id

  state_bucket_name = local.bootstrap_bucket_name
  loki_bucket_name  = var.enable_observability ? module.observability[0].loki_bucket : ""
  tempo_bucket_name = var.enable_observability ? module.observability[0].tempo_bucket : ""

  security_alert_email    = var.security_alert_email
  security_critical_email = var.security_critical_email

  github_token_secret_arn = local.github_token_secret_arn
  github_repo             = var.security_github_repo

  application_namespace = var.order_api_namespace

  oidc_provider_arn = local.oidc_provider_arn
  oidc_provider_url = local.oidc_provider_url

  enable_external_secrets       = var.enable_external_secrets
  external_secrets_allowed_arns = var.external_secrets_allowed_arns

  tags = local.common_tags

  depends_on = [module.observability]
}

module "finops" {
  count  = var.enable_finops ? 1 : 0
  source = "../../modules/finops"

  project_name   = var.project_name
  environment    = var.environment
  aws_account_id = local.account_id

  cost_budget_monthly_usd        = var.cost_budget_monthly_usd
  cost_alert_email               = var.cost_alert_email
  cost_anomaly_threshold_percent = var.cost_anomaly_threshold_percent

  eks_cluster_name = var.enable_observability ? local.eks_cluster_name : ""
  rds_instance_id  = local.rds_instance_id

  tags = local.common_tags

  depends_on = [module.observability]
}

module "self_healing" {
  count  = var.enable_self_healing ? 1 : 0
  source = "../../modules/self_healing"

  project_name   = var.project_name
  environment    = var.environment
  region         = var.region
  aws_account_id = local.account_id

  eks_cluster_name = local.eks_cluster_name
  rds_instance_id  = local.rds_instance_id

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

  depends_on = [module.observability]
}
