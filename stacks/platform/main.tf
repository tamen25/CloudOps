#This file defines main settings for CloudOps.
#Platform stack - layer 3 of the split Terraform layout.
#
#Owns Kubernetes-facing platform services plus adjacent AWS automation:
#ingress, observability, security, SLO, FinOps, and self-healing.
#Reads foundation and cluster outputs through terraform_remote_state.

data "aws_caller_identity" "current" {}

#Creates the terraform data resource named toggle guard.
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
    enable_mesh                          = var.enable_mesh
    enable_loadgen                       = var.enable_loadgen
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

    precondition {
      condition     = !var.enable_mesh || (var.enable_eks && var.enable_observability)
      error_message = "enable_mesh=true requires enable_eks=true and enable_observability=true (the kubernetes provider must be real, not the localhost fallback)."
    }

    precondition {
      condition     = !var.enable_loadgen || var.enable_mesh
      error_message = "enable_loadgen=true requires enable_mesh=true (the loadgen targets the in-cluster api-gateway)."
    }
  }
}

#Groups local values used by this Terraform file.
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

  #OTLP endpoint the mesh services export to. Same ALB-fronted collector the
  #apps use; empty when observability is off so the SDKs no-op (no retry storm).
  mesh_otel_endpoint = var.enable_observability ? "https://otel.${var.domain_name}" : ""
}

#Wires the ingress module into this stack.
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
  waf_log_retention_days  = var.waf_log_retention_days

  tags = local.common_tags
}

#Wires the observability module into this stack.
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
  application_namespace = var.order_api_namespace

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

  #Backlog #61
  publish_otel_ssm_config = var.publish_otel_ssm_config
  ssm_kms_key_id          = var.ssm_kms_key_id

  tags = local.common_tags
}

#Wires the SLO module into this stack.
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

#Wires the security module into this stack.
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

#Wires the finops module into this stack.
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

#Wires the self healing module into this stack.
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

#Wires the auth module (Cognito User Pool + Hosted UI) — closes backlog #80.
module "auth" {
  count  = var.enable_auth ? 1 : 0
  source = "../../modules/auth"

  project_name = var.project_name
  environment  = var.environment

  domain_name                   = var.domain_name
  route53_zone_id               = var.auth_route53_zone_id
  create_hosted_ui_domain       = var.auth_create_hosted_ui_domain
  hosted_ui_acm_certificate_arn = var.auth_hosted_ui_acm_certificate_arn

  callback_urls = length(var.auth_callback_urls) > 0 ? var.auth_callback_urls : [
    "https://${var.domain_name}/auth/callback",
  ]
  logout_urls = length(var.auth_logout_urls) > 0 ? var.auth_logout_urls : [
    "https://${var.domain_name}/",
  ]

  password_minimum_length       = var.auth_password_minimum_length
  mfa_configuration             = var.auth_mfa_configuration
  id_token_validity_minutes     = var.auth_id_token_validity_minutes
  access_token_validity_minutes = var.auth_access_token_validity_minutes
  refresh_token_validity_days   = var.auth_refresh_token_validity_days
  admin_group_name              = var.auth_admin_group_name

  tags = local.common_tags
}

#Wires the storefront-search module (closes backlog #82).
#Requires enable_auth=true so the JWT authorizer has a User Pool to point at.
module "storefront_search" {
  count  = var.enable_storefront_search ? 1 : 0
  source = "../../modules/storefront-search"

  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  domain_name  = var.domain_name

  create_custom_domain = var.storefront_search_create_custom_domain
  search_subdomain     = var.storefront_search_subdomain
  acm_certificate_arn  = var.storefront_search_acm_certificate_arn
  route53_zone_id      = local.route53_zone_id

  cognito_user_pool_id = var.enable_auth ? module.auth[0].user_pool_id : ""
  cognito_client_id    = var.enable_auth ? module.auth[0].storefront_client_id : ""

  private_subnet_ids          = var.storefront_search_private_subnet_ids
  vpc_link_security_group_ids = var.storefront_search_lambda_extra_sgs
  order_api_internal_url      = var.storefront_search_order_api_internal_url
  hmac_secret_parameter_name  = var.storefront_search_hmac_parameter_name

  lambda_memory_mb       = var.storefront_search_lambda_memory_mb
  lambda_timeout_seconds = var.storefront_search_lambda_timeout_seconds
  otel_endpoint          = var.storefront_search_otel_endpoint

  tags = local.common_tags

  depends_on = [module.auth]
}

#Wires the storefront-assets module (closes backlog #88).
module "storefront_assets" {
  count  = var.enable_storefront_assets ? 1 : 0
  source = "../../modules/storefront-assets"

  project_name              = var.project_name
  environment               = var.environment
  region                    = var.region
  domain_name               = var.domain_name
  create_custom_domain      = var.storefront_assets_create_custom_domain
  assets_subdomain          = var.storefront_assets_subdomain
  acm_certificate_arn       = var.storefront_assets_acm_certificate_arn
  route53_zone_id           = local.route53_zone_id
  storefront_irsa_role_name = var.storefront_assets_storefront_irsa_role_name
  sharp_layer_arn           = var.storefront_assets_sharp_layer_arn

  tags = local.common_tags
}

#Wires the storefront-checkout module (closes backlog #87).
module "storefront_checkout" {
  count  = var.enable_storefront_checkout ? 1 : 0
  source = "../../modules/storefront-checkout"

  project_name              = var.project_name
  environment               = var.environment
  region                    = var.region
  order_api_url             = var.storefront_checkout_order_api_url
  ses_source_email          = var.storefront_checkout_ses_source_email
  storefront_irsa_role_name = var.storefront_checkout_storefront_irsa_role_name

  tags = local.common_tags
}

#Wires the storefront-realtime module (closes backlog #86).
module "storefront_realtime" {
  count  = var.enable_storefront_realtime ? 1 : 0
  source = "../../modules/storefront-realtime"

  project_name = var.project_name
  environment  = var.environment
  region       = var.region
  domain_name  = var.domain_name

  create_custom_domain = var.storefront_realtime_create_custom_domain
  ws_subdomain         = var.storefront_realtime_ws_subdomain
  acm_certificate_arn  = var.storefront_realtime_acm_certificate_arn
  route53_zone_id      = local.route53_zone_id

  cognito_issuer_url        = var.enable_auth ? module.auth[0].issuer_url : ""
  cognito_client_id         = var.enable_auth ? module.auth[0].storefront_client_id : ""
  ws_token_secret_arn       = var.storefront_realtime_ws_token_secret_arn
  storefront_irsa_role_name = var.storefront_realtime_storefront_irsa_role_name

  kinesis_stream_arn = var.enable_storefront_events ? module.storefront_events[0].stream_arn : ""
  fanout_dlq_arn     = var.storefront_realtime_fanout_dlq_arn

  tags = local.common_tags

  depends_on = [module.auth, module.storefront_events]
}

#Wires the storefront-events module (closes backlog #85).
module "storefront_events" {
  count  = var.enable_storefront_events ? 1 : 0
  source = "../../modules/storefront-events"

  project_name             = var.project_name
  environment              = var.environment
  retention_hours          = var.storefront_events_retention_hours
  kms_key_arn              = var.storefront_events_kms_key_arn
  order_api_irsa_role_name = var.storefront_events_order_api_role_name

  tags = local.common_tags
}

#Wires the storefront-cart module (closes backlog #84).
module "storefront_cart" {
  count  = var.enable_storefront_cart ? 1 : 0
  source = "../../modules/storefront-cart"

  project_name = var.project_name
  environment  = var.environment

  oidc_provider_arn         = local.oidc_provider_arn
  oidc_provider_url         = local.oidc_provider_url
  service_account_namespace = var.storefront_namespace
  service_account_name      = var.storefront_service_account

  tags = local.common_tags
}

#─── Polyglot mesh (distributed-tracing showcase) ─────────────────────────────
#Each service is one instance of the generic modules/mesh. The trace root
#(api-gateway, Node) fans out across pricing (Go) → inventory (Python) → fraud
#(Java) → payment (Node) → ledger (Go); projection-worker (Python) consumes the
#order-event stream. All gated on var.enable_mesh (requires EKS + observability).

#pricing (Go) — quotes line items. Reachable only from the gateway.
module "mesh_pricing" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name                     = "pricing"
  namespace                = var.mesh_namespace
  lang                     = "go"
  image                    = var.mesh_pricing_image
  container_port           = 8080
  run_as_user              = 65532
  needs_tmp_volume         = false
  replicas                 = var.mesh_replicas
  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "api-gateway" }

  tags = local.common_tags
}

#inventory (Python) — reserve stock. Reachable only from the gateway.
module "mesh_inventory" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name                     = "inventory"
  namespace                = var.mesh_namespace
  lang                     = "python"
  image                    = var.mesh_inventory_image
  container_port           = 8080
  run_as_user              = 1001
  needs_tmp_volume         = true
  replicas                 = var.mesh_replicas
  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "api-gateway" }

  tags = local.common_tags
}

#fraud (Java) — risk score. Reachable only from the gateway.
module "mesh_fraud" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name                     = "fraud"
  namespace                = var.mesh_namespace
  lang                     = "java"
  image                    = var.mesh_fraud_image
  container_port           = 8080
  run_as_user              = 1001
  needs_tmp_volume         = true
  replicas                 = var.mesh_replicas
  cpu_request              = "100m"
  memory_request           = "256Mi"
  cpu_limit                = "500m"
  memory_limit             = "512Mi"
  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "api-gateway" }

  tags = local.common_tags
}

#ledger (Go) — double-entry append. Reachable only from payment.
module "mesh_ledger" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name                     = "ledger"
  namespace                = var.mesh_namespace
  lang                     = "go"
  image                    = var.mesh_ledger_image
  container_port           = 8080
  run_as_user              = 65532
  needs_tmp_volume         = false
  replicas                 = var.mesh_replicas
  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "payment" }

  tags = local.common_tags
}

#payment (Node) — authorize + post to ledger. Reachable only from the gateway.
module "mesh_payment" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name             = "payment"
  namespace        = var.mesh_namespace
  lang             = "node"
  image            = var.mesh_payment_image
  container_port   = 8080
  run_as_user      = 1001
  needs_tmp_volume = true
  replicas         = var.mesh_replicas

  env = {
    NODE_ENV   = var.environment
    LEDGER_URL = var.enable_mesh ? module.mesh_ledger[0].service_url : ""
  }

  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"
  ingress_from_labels      = { app = "api-gateway" }

  tags = local.common_tags
}

#mesh-events — serverless async fan-out: Kinesis → enrichment-lambda →
#EventBridge → analytics-lambda. Reuses the storefront-events order stream.
module "mesh_events" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh-events"

  project_name       = var.project_name
  environment        = var.environment
  kinesis_stream_arn = var.enable_storefront_events ? module.storefront_events[0].stream_arn : ""

  tags = local.common_tags
}

#projection-worker (Python) — Kinesis consumer building a read model. No
#ingress (pulls from Kinesis); exposes /metrics for scraping.
module "mesh_projection" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name             = "projection-worker"
  namespace        = var.mesh_namespace
  lang             = "python"
  image            = var.mesh_projection_image
  container_port   = 8080
  run_as_user      = 1001
  needs_tmp_volume = true
  replicas         = var.mesh_replicas

  env = {
    KINESIS_STREAM_NAME = var.enable_storefront_events ? module.storefront_events[0].stream_name : ""
    AWS_REGION          = var.region
  }

  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"

  tags = local.common_tags
}

#api-gateway (Node) — mesh edge / trace root. Fans out to the whole chain.
module "mesh_gateway" {
  count  = var.enable_mesh ? 1 : 0
  source = "../../modules/mesh"

  name             = "api-gateway"
  namespace        = var.mesh_namespace
  lang             = "node"
  image            = var.mesh_gateway_image
  container_port   = 8080
  run_as_user      = 1001
  needs_tmp_volume = true
  replicas         = var.mesh_replicas
  cpu_request      = "25m"
  memory_request   = "64Mi"
  cpu_limit        = "150m"
  memory_limit     = "128Mi"

  env = {
    NODE_ENV      = var.environment
    PRICING_URL   = var.enable_mesh ? module.mesh_pricing[0].service_url : ""
    INVENTORY_URL = var.enable_mesh ? module.mesh_inventory[0].service_url : ""
    FRAUD_URL     = var.enable_mesh ? module.mesh_fraud[0].service_url : ""
    PAYMENT_URL   = var.enable_mesh ? module.mesh_payment[0].service_url : ""
  }

  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"

  tags = local.common_tags
}

#loadgen — control API + steady-trickle CronJob. Targets only the gateway.
module "loadgen" {
  count  = var.enable_loadgen ? 1 : 0
  source = "../../modules/loadgen"

  namespace                = var.mesh_namespace
  image                    = var.mesh_loadgen_image
  gateway_url              = var.enable_mesh ? module.mesh_gateway[0].service_url : ""
  environment              = var.environment
  replicas                 = var.mesh_replicas
  otel_endpoint            = local.mesh_otel_endpoint
  otel_resource_attributes = "deployment.environment=${var.environment}"

  enable_trickle           = var.loadgen_enable_trickle
  trickle_rps              = var.loadgen_trickle_rps
  trickle_duration_seconds = var.loadgen_trickle_duration_seconds

  tags = local.common_tags
}
