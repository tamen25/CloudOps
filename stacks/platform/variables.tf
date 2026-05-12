#This file defines variables settings for CloudOps.
variable "region" {
  type    = string
  default = "us-east-1"
}

#Defines the environment input value.
variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the project name input value.
variable "project_name" {
  type = string
}

#Defines the owner input value.
variable "owner" {
  type    = string
  default = ""
}

#Defines the domain name input value.
variable "domain_name" {
  type = string
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  type    = string
  default = ""
}

#Compatibility with the shared root terraform.tfvars file.
variable "destroy_all" {
  type    = bool
  default = false
}

#Defines the enable networking input value.
variable "enable_networking" {
  type    = bool
  default = true
}

#Defines the enable EKS input value.
variable "enable_eks" {
  type    = bool
  default = true
}

#Defines the enable database input value.
variable "enable_database" {
  type    = bool
  default = false
}

#Defines the enable ingress input value.
variable "enable_ingress" {
  type    = bool
  default = false
}

#Defines the enable observability input value.
variable "enable_observability" {
  type    = bool
  default = false
}

#Defines the enable SLO input value.
variable "enable_slo" {
  type    = bool
  default = false
}

#Defines the enable security input value.
variable "enable_security" {
  type    = bool
  default = false
}

#Defines the enable finops input value.
variable "enable_finops" {
  type    = bool
  default = false
}

#Defines the enable codeartifact input value.
variable "enable_codeartifact" {
  type    = bool
  default = false
}

#Defines the codeartifact domain name input value.
variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

#Defines the codeartifact repository names input value.
variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

#Defines the codeartifact KMS key arn input value.
variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

#Defines the enable self healing input value.
variable "enable_self_healing" {
  type    = bool
  default = false
}

#Defines the enable alertmanager input value.
variable "enable_alertmanager" {
  type    = bool
  default = false
}

#Defines the enable yace input value.
variable "enable_yace" {
  type    = bool
  default = false
}

#Defines the enable external secrets input value.
variable "enable_external_secrets" {
  type    = bool
  default = false
}

#Defines the enable WAF input value.
variable "enable_waf" {
  type    = bool
  default = false
}

#Upstream state wiring. scripts/tf-init.sh writes these into backend.auto.tfvars.
variable "use_remote_state_foundation" {
  type    = bool
  default = true
}

#Defines the foundation state bucket input value.
variable "foundation_state_bucket" {
  type    = string
  default = ""
}

#Defines the foundation state key input value.
variable "foundation_state_key" {
  type    = string
  default = ""
}

#Defines the use remote state cluster input value.
variable "use_remote_state_cluster" {
  type    = bool
  default = true
}

#Defines the cluster state bucket input value.
variable "cluster_state_bucket" {
  type    = string
  default = ""
}

#Defines the cluster state key input value.
variable "cluster_state_key" {
  type    = string
  default = ""
}

#Explicit fallback inputs for migration or bring-your-own upstream resources.
variable "existing_vpc_id" {
  type    = string
  default = ""
}

#Defines the existing database subnet cidrs input value.
variable "existing_db_subnet_cidrs" {
  type    = list(string)
  default = []
}

#Defines the existing route53 zone ID input value.
variable "existing_route53_zone_id" {
  type    = string
  default = ""
}

#Defines the existing RDS instance ID input value.
variable "existing_rds_instance_id" {
  type    = string
  default = ""
}

#Defines the existing cluster name input value.
variable "existing_cluster_name" {
  type    = string
  default = ""
}

#Defines the existing cluster endpoint input value.
variable "existing_cluster_endpoint" {
  type    = string
  default = ""
}

#Defines the existing cluster ca certificate input value.
variable "existing_cluster_ca_certificate" {
  type    = string
  default = ""
}

#Defines the existing OIDC provider arn input value.
variable "existing_oidc_provider_arn" {
  type    = string
  default = ""
}

#Defines the existing OIDC provider URL input value.
variable "existing_oidc_provider_url" {
  type    = string
  default = ""
}

#Defines the VPC cidr input value.
variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

#Defines the bootstrap bucket name input value.
variable "bootstrap_bucket_name" {
  type    = string
  default = ""
}

#Ingress and ALB follow-up inputs.
variable "alb_dns_name" {
  type    = string
  default = ""
}

#Defines the alb zone ID input value.
variable "alb_zone_id" {
  type    = string
  default = ""
}

#Defines the OTel alb DNS name input value.
variable "otel_alb_dns_name" {
  type    = string
  default = ""
}

#Defines the OTel alb zone ID input value.
variable "otel_alb_zone_id" {
  type    = string
  default = ""
}

#Defines the WAF rate limit per 5min input value.
variable "waf_rate_limit_per_5min" {
  type    = number
  default = 2000
}

#Defines the WAF geo block countries input value.
variable "waf_geo_block_countries" {
  type    = list(string)
  default = []
}

#Defines the WAF logging enabled input value.
variable "waf_logging_enabled" {
  type    = bool
  default = true
}

#Observability.
variable "order_api_namespace" {
  type    = string
  default = "cloudops"
}

#Defines the security alert email input value.
variable "security_alert_email" {
  type    = string
  default = ""
}

#Defines the security critical email input value.
variable "security_critical_email" {
  type    = string
  default = ""
}

#Defines the grafana alert webhook URL input value.
variable "grafana_alert_webhook_url" {
  type    = string
  default = ""
}

#Defines the OTel ingestion internal input value.
variable "otel_ingestion_internal" {
  type    = bool
  default = false
}

#Defines the OTel allowed cidrs input value.
variable "otel_allowed_cidrs" {
  type    = list(string)
  default = []
}

#Defines the OTel rate limit per 5min input value.
variable "otel_rate_limit_per_5min" {
  type    = number
  default = 0
}

#Defines the OTel token rotation days input value.
variable "otel_token_rotation_days" {
  type    = number
  default = 0
}

#Backlog #61 — OTel SSM publishing.
variable "publish_otel_ssm_config" {
  type    = bool
  default = false
}

#Defines the SSM KMS key ID input value.
variable "ssm_kms_key_id" {
  type    = string
  default = ""
}

#Defines the buckets force destroy input value.
variable "buckets_force_destroy" {
  type    = bool
  default = true
}

#Defines the buckets versioning input value.
variable "buckets_versioning" {
  type    = bool
  default = false
}

#Defines the buckets KMS cmk input value.
variable "buckets_kms_cmk" {
  type    = bool
  default = false
}

#Defines the buckets replication destination arn input value.
variable "buckets_replication_destination_arn" {
  type    = string
  default = ""
}

#Defines the buckets replication role arn input value.
variable "buckets_replication_role_arn" {
  type    = string
  default = ""
}

#Defines the buckets glacier transition days input value.
variable "buckets_glacier_transition_days" {
  type    = number
  default = 30
}

#Defines the buckets expiration days input value.
variable "buckets_expiration_days" {
  type    = number
  default = 0
}

#Defines the loki replication factor input value.
variable "loki_replication_factor" {
  type    = number
  default = 1
}

#Defines the loki write replicas input value.
variable "loki_write_replicas" {
  type    = number
  default = 2
}

#Defines the loki read replicas input value.
variable "loki_read_replicas" {
  type    = number
  default = 2
}

#Defines the prometheus replicas input value.
variable "prometheus_replicas" {
  type    = number
  default = 1
}

#Defines the prometheus retention input value.
variable "prometheus_retention" {
  type    = string
  default = "15d"
}

#Defines the tempo ingester replicas input value.
variable "tempo_ingester_replicas" {
  type    = number
  default = 1
}

#Defines the tempo metrics generator enabled input value.
variable "tempo_metrics_generator_enabled" {
  type    = bool
  default = false
}

#Defines the metrics long term storage input value.
variable "metrics_long_term_storage" {
  type    = string
  default = "none"

  validation {
    condition     = contains(["none", "mimir", "thanos"], var.metrics_long_term_storage)
    error_message = "metrics_long_term_storage must be one of: none, mimir, thanos."
  }
}

#SLO.
variable "slo_prometheus_url" {
  type    = string
  default = ""
}

#Defines the SLO grafana API key secret arn input value.
variable "slo_grafana_api_key_secret_arn" {
  type    = string
  default = ""
}

#Security and automation.
variable "security_github_token_secret_arn" {
  type    = string
  default = ""
}

#Defines the security github repo input value.
variable "security_github_repo" {
  type    = string
  default = ""
}

#Defines the external secrets allowed arns input value.
variable "external_secrets_allowed_arns" {
  type    = list(string)
  default = []
}

#Defines the self healing alb arn suffix input value.
variable "self_healing_alb_arn_suffix" {
  type    = string
  default = ""
}

#Defines the self healing target group arn suffix input value.
variable "self_healing_target_group_arn_suffix" {
  type    = string
  default = ""
}

#Defines the self healing min healthy pods input value.
variable "self_healing_min_healthy_pods" {
  type    = number
  default = 2
}

#Defines the self healing max scale out pods input value.
variable "self_healing_max_scale_out_pods" {
  type    = number
  default = 10
}

#Defines the self healing rollback on error rate input value.
variable "self_healing_rollback_on_error_rate" {
  type    = number
  default = 5
}

#Defines the self healing dry run input value.
variable "self_healing_dry_run" {
  type    = bool
  default = false
}

#FinOps.
variable "cost_budget_monthly_usd" {
  type    = number
  default = 50
}

#Defines the cost alert email input value.
variable "cost_alert_email" {
  type    = string
  default = ""
}

#Defines the cost anomaly threshold percent input value.
variable "cost_anomaly_threshold_percent" {
  type    = number
  default = 20
}

#─── Auth (#80) — Cognito User Pool + Hosted UI ────────────────────────────
variable "enable_auth" {
  description = "Provision Cognito User Pool + storefront app client (closes backlog #80)."
  type        = bool
  default     = false
}

variable "auth_route53_zone_id" {
  description = "Route 53 hosted zone ID for the apex domain. Required when auth_create_hosted_ui_domain=true."
  type        = string
  default     = ""
}

variable "auth_create_hosted_ui_domain" {
  description = "Provision the custom Hosted UI domain auth.<domain>. Requires an ACM cert in us-east-1."
  type        = bool
  default     = false
}

variable "auth_hosted_ui_acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for auth.<domain>."
  type        = string
  default     = ""
}

variable "auth_callback_urls" {
  description = "OAuth callback URLs. Defaults to https://<domain>/auth/callback when empty."
  type        = list(string)
  default     = []
}

variable "auth_logout_urls" {
  description = "OAuth sign-out URLs. Defaults to https://<domain>/ when empty."
  type        = list(string)
  default     = []
}

variable "auth_password_minimum_length" {
  description = "Cognito password policy minimum length."
  type        = number
  default     = 12
}

variable "auth_mfa_configuration" {
  description = "Cognito MFA mode: OFF / ON / OPTIONAL."
  type        = string
  default     = "OPTIONAL"
}

variable "auth_id_token_validity_minutes" {
  description = "ID token validity in minutes."
  type        = number
  default     = 60
}

variable "auth_access_token_validity_minutes" {
  description = "Access token validity in minutes."
  type        = number
  default     = 60
}

variable "auth_refresh_token_validity_days" {
  description = "Refresh token validity in days."
  type        = number
  default     = 30
}

variable "auth_admin_group_name" {
  description = "Cognito group name that gates storefront /admin/* routes."
  type        = string
  default     = "admin"
}

#─── Storefront Search (#82) ───────────────────────────────────────────────
variable "enable_storefront_search" {
  description = "Provision API GW HTTP + Lambda search-gateway → Express _internal/search."
  type        = bool
  default     = false
}

variable "storefront_search_create_custom_domain" {
  description = "Create the search.<domain_name> custom domain + Route 53 alias."
  type        = bool
  default     = false
}

variable "storefront_search_subdomain" {
  description = "Subdomain for the search API."
  type        = string
  default     = "search"
}

variable "storefront_search_acm_certificate_arn" {
  description = "ACM certificate ARN for search.<domain_name> (same region as the API GW)."
  type        = string
  default     = ""
}

variable "storefront_search_private_subnet_ids" {
  description = "Private subnet IDs for the Lambda VPC config. Default empty — set when enable_storefront_search=true."
  type        = list(string)
  default     = []
}

variable "storefront_search_lambda_extra_sgs" {
  description = "Extra security group IDs to attach to the Lambda ENIs (e.g. an in-cluster SG that order-api allows on 3000)."
  type        = list(string)
  default     = []
}

variable "storefront_search_order_api_internal_url" {
  description = "Internal URL Lambda calls to reach Express _internal/search (e.g. http://order-api.cloudops.svc.cluster.local:3000)."
  type        = string
  default     = ""
}

variable "storefront_search_hmac_parameter_name" {
  description = "SSM Parameter Store name (SecureString) holding the order-api INTERNAL_HMAC_SECRET. Empty disables SSM read; Lambda falls back to its own env var."
  type        = string
  default     = ""
}

variable "storefront_search_lambda_memory_mb" {
  description = "Lambda memory size."
  type        = number
  default     = 256
}

variable "storefront_search_lambda_timeout_seconds" {
  description = "Lambda timeout."
  type        = number
  default     = 5
}

variable "storefront_search_otel_endpoint" {
  description = "OTEL_EXPORTER_OTLP_ENDPOINT for the Lambda."
  type        = string
  default     = ""
}

#─── Storefront shared namespace / SA names (used by cart, checkout, etc.) ─
variable "storefront_namespace" {
  description = "Kubernetes namespace where the storefront Deployment lives."
  type        = string
  default     = "storefront"
}

variable "storefront_service_account" {
  description = "Kubernetes ServiceAccount name for the storefront pod."
  type        = string
  default     = "storefront"
}

#─── Storefront Cart (#84) ─────────────────────────────────────────────────
variable "enable_storefront_cart" {
  description = "Provision the cloudops-cart-<env> Dynamo table + IRSA role."
  type        = bool
  default     = false
}

#─── Storefront Events (#85) ───────────────────────────────────────────────
variable "enable_storefront_events" {
  description = "Provision the orders-events Kinesis Data Stream + publisher policy."
  type        = bool
  default     = false
}

variable "storefront_events_retention_hours" {
  description = "Kinesis stream retention in hours (AWS minimum 24, maximum 8760)."
  type        = number
  default     = 24
}

variable "storefront_events_kms_key_arn" {
  description = "KMS CMK ARN. Empty falls back to alias/aws/kinesis."
  type        = string
  default     = ""
}

variable "storefront_events_order_api_role_name" {
  description = "Name (not ARN) of the order-api IRSA role to attach the publisher policy to. Sourced from the cluster stack output."
  type        = string
  default     = ""
}

#─── Storefront Realtime (#86) ─────────────────────────────────────────────
variable "enable_storefront_realtime" {
  description = "Provision API GW WebSocket + 3 Lambdas + connection-registry Dynamo."
  type        = bool
  default     = false
}

variable "storefront_realtime_create_custom_domain" {
  description = "Create ws.<domain_name> custom domain + Route 53 alias."
  type        = bool
  default     = false
}

variable "storefront_realtime_ws_subdomain" {
  description = "Subdomain for the WebSocket API."
  type        = string
  default     = "ws"
}

variable "storefront_realtime_acm_certificate_arn" {
  description = "ACM certificate ARN for ws.<domain_name> (same region as the WS API)."
  type        = string
  default     = ""
}

variable "storefront_realtime_fanout_dlq_arn" {
  description = "Optional SQS DLQ ARN for the fanout Lambda. Empty disables DLQ."
  type        = string
  default     = ""
}

#─── Storefront Checkout (#87) ─────────────────────────────────────────────
variable "enable_storefront_checkout" {
  description = "Provision Step Functions checkout saga + SQS email queue + email Lambda."
  type        = bool
  default     = false
}

variable "storefront_checkout_order_api_url" {
  description = "Internal URL Step Functions calls for POST /order (e.g. http://order-api.cloudops.svc.cluster.local:3000)."
  type        = string
  default     = ""
}

variable "storefront_checkout_ses_source_email" {
  description = "Verified SES identity for order-confirmation emails. Empty disables SES + email policy."
  type        = string
  default     = ""
}

variable "storefront_checkout_storefront_irsa_role_name" {
  description = "Storefront IRSA role name to grant states:StartExecution. Empty skips the inline policy attachment."
  type        = string
  default     = ""
}

#─── Storefront Assets (#88) ───────────────────────────────────────────────
variable "enable_storefront_assets" {
  description = "Provision the S3 assets bucket + CloudFront + image-resize Lambda."
  type        = bool
  default     = false
}

variable "storefront_assets_create_custom_domain" {
  description = "Create assets.<domain_name> CloudFront alias + Route 53 record."
  type        = bool
  default     = false
}

variable "storefront_assets_subdomain" {
  description = "Subdomain for the CDN."
  type        = string
  default     = "assets"
}

variable "storefront_assets_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 (CloudFront requirement)."
  type        = string
  default     = ""
}

variable "storefront_assets_storefront_irsa_role_name" {
  description = "Storefront IRSA role name — grants s3:PutObject on originals/ for presigned uploads."
  type        = string
  default     = ""
}

variable "storefront_assets_sharp_layer_arn" {
  description = "Optional Lambda layer ARN providing sharp + libvips arm64. Empty packages sharp in the Lambda zip."
  type        = string
  default     = ""
}
