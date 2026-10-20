variable "region" {
  type    = string
  default = "us-east-1"
}

variable "environment" {
  type = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

variable "project_name" {
  type = string
}

variable "owner" {
  type    = string
  default = ""
}

variable "domain_name" {
  type = string
}

variable "aws_account_id" {
  type    = string
  default = ""
}

#Compatibility with the shared root terraform.tfvars file.
variable "destroy_all" {
  type    = bool
  default = false
}

variable "enable_networking" {
  type    = bool
  default = true
}

variable "enable_eks" {
  type    = bool
  default = true
}

variable "enable_database" {
  type    = bool
  default = false
}

variable "enable_ingress" {
  type    = bool
  default = false
}

variable "enable_observability" {
  type    = bool
  default = false
}

variable "enable_slo" {
  type    = bool
  default = false
}

variable "enable_security" {
  type    = bool
  default = false
}

variable "enable_finops" {
  type    = bool
  default = false
}

variable "enable_codeartifact" {
  type    = bool
  default = false
}

variable "codeartifact_domain_name" {
  type    = string
  default = ""
}

variable "codeartifact_repository_names" {
  type    = list(string)
  default = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

variable "codeartifact_kms_key_arn" {
  type    = string
  default = ""
}

variable "enable_self_healing" {
  type    = bool
  default = false
}

variable "enable_alertmanager" {
  type    = bool
  default = false
}

variable "enable_yace" {
  type    = bool
  default = false
}

variable "enable_external_secrets" {
  type    = bool
  default = false
}

variable "enable_waf" {
  type    = bool
  default = false
}

#Upstream state wiring. scripts/tf-init.sh writes these into backend.auto.tfvars.
variable "use_remote_state_foundation" {
  type    = bool
  default = true
}

variable "foundation_state_bucket" {
  type    = string
  default = ""
}

variable "foundation_state_key" {
  type    = string
  default = ""
}

variable "use_remote_state_cluster" {
  type    = bool
  default = true
}

variable "cluster_state_bucket" {
  type    = string
  default = ""
}

variable "cluster_state_key" {
  type    = string
  default = ""
}

#Explicit fallback inputs for migration or bring-your-own upstream resources.
variable "existing_vpc_id" {
  type    = string
  default = ""
}

variable "existing_db_subnet_cidrs" {
  type    = list(string)
  default = []
}

variable "existing_route53_zone_id" {
  type    = string
  default = ""
}

variable "existing_rds_instance_id" {
  type    = string
  default = ""
}

variable "existing_cluster_name" {
  type    = string
  default = ""
}

variable "existing_cluster_endpoint" {
  type    = string
  default = ""
}

variable "existing_cluster_ca_certificate" {
  type    = string
  default = ""
}

variable "existing_oidc_provider_arn" {
  type    = string
  default = ""
}

variable "existing_oidc_provider_url" {
  type    = string
  default = ""
}

variable "vpc_cidr" {
  type    = string
  default = "10.0.0.0/16"
}

variable "bootstrap_bucket_name" {
  type    = string
  default = ""
}

#Ingress and ALB follow-up inputs.
variable "alb_dns_name" {
  type    = string
  default = ""
}

variable "alb_zone_id" {
  type    = string
  default = ""
}

variable "otel_alb_dns_name" {
  type    = string
  default = ""
}

variable "otel_alb_zone_id" {
  type    = string
  default = ""
}

variable "waf_rate_limit_per_5min" {
  type    = number
  default = 2000
}

variable "waf_geo_block_countries" {
  type    = list(string)
  default = []
}

variable "waf_logging_enabled" {
  type    = bool
  default = true
}

#Closes backlog #102. WAF CloudWatch log retention; per-env override.
variable "waf_log_retention_days" {
  type    = number
  default = 30
}

#Observability.
variable "order_api_namespace" {
  type    = string
  default = "cloudops"
}

variable "security_alert_email" {
  type    = string
  default = ""
}

variable "security_critical_email" {
  type    = string
  default = ""
}

variable "grafana_alert_webhook_url" {
  type    = string
  default = ""
}

variable "otel_ingestion_internal" {
  type    = bool
  default = false
}

variable "otel_allowed_cidrs" {
  type    = list(string)
  default = []
}

variable "otel_rate_limit_per_5min" {
  type    = number
  default = 0
}

variable "otel_token_rotation_days" {
  type    = number
  default = 0
}

#Backlog #61 — OTel SSM publishing.
variable "publish_otel_ssm_config" {
  type    = bool
  default = false
}

variable "ssm_kms_key_id" {
  type    = string
  default = ""
}

variable "buckets_force_destroy" {
  type    = bool
  default = true
}

variable "buckets_versioning" {
  type    = bool
  default = false
}

variable "buckets_kms_cmk" {
  type    = bool
  default = false
}

variable "buckets_replication_destination_arn" {
  type    = string
  default = ""
}

variable "buckets_replication_role_arn" {
  type    = string
  default = ""
}

variable "buckets_glacier_transition_days" {
  type    = number
  default = 30
}

variable "buckets_expiration_days" {
  type    = number
  default = 0
}

variable "loki_replication_factor" {
  type    = number
  default = 1
}

variable "loki_write_replicas" {
  type    = number
  default = 2
}

variable "loki_read_replicas" {
  type    = number
  default = 2
}

variable "prometheus_replicas" {
  type    = number
  default = 1
}

variable "prometheus_retention" {
  type    = string
  default = "15d"
}

variable "tempo_ingester_replicas" {
  type    = number
  default = 1
}

variable "tempo_metrics_generator_enabled" {
  type    = bool
  default = false
}

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

variable "slo_grafana_api_key_secret_arn" {
  type    = string
  default = ""
}

#Security and automation.
variable "security_github_token_secret_arn" {
  type    = string
  default = ""
}

variable "security_github_repo" {
  type    = string
  default = ""
}

variable "external_secrets_allowed_arns" {
  type    = list(string)
  default = []
}

variable "self_healing_alb_arn_suffix" {
  type    = string
  default = ""
}

variable "self_healing_target_group_arn_suffix" {
  type    = string
  default = ""
}

variable "self_healing_min_healthy_pods" {
  type    = number
  default = 2
}

variable "self_healing_max_scale_out_pods" {
  type    = number
  default = 10
}

variable "self_healing_rollback_on_error_rate" {
  type    = number
  default = 5
}

variable "self_healing_dry_run" {
  type    = bool
  default = false
}

#FinOps.
variable "cost_budget_monthly_usd" {
  type    = number
  default = 50
}

variable "cost_alert_email" {
  type    = string
  default = ""
}

variable "cost_anomaly_threshold_percent" {
  type    = number
  default = 20
}

#FinOps hard-cap stop-loss (#139).
variable "enable_budget_hardcap_action" {
  type    = bool
  default = false
}

variable "budget_hardcap_threshold_percent" {
  type    = number
  default = 120
}

variable "budget_hardcap_target_role_names" {
  type    = list(string)
  default = []
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

variable "storefront_realtime_ws_token_secret_arn" {
  description = "Secrets Manager ARN for the shared WS ticket signing secret used by storefront and ws-connect."
  type        = string
  default     = ""
}

variable "storefront_realtime_storefront_irsa_role_name" {
  description = "Storefront IRSA role name to grant realtime connection cleanup during privacy erasure."
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

#─── Polyglot mesh ────────────────────────────────────────────────────────────
variable "enable_mesh" {
  description = "Deploy the polyglot service mesh (api-gateway + pricing + ...). Requires enable_eks + enable_observability."
  type        = bool
  default     = false
}

variable "mesh_namespace" {
  description = "Kubernetes namespace for mesh services."
  type        = string
  default     = "cloudops"
}

variable "mesh_replicas" {
  description = "Replica count for each mesh service (dev default 1)."
  type        = number
  default     = 1
}

variable "mesh_gateway_image" {
  description = "Container image for the api-gateway service (set at deploy time from the pushed tag)."
  type        = string
  default     = ""
}

variable "mesh_pricing_image" {
  description = "Container image for the pricing service."
  type        = string
  default     = ""
}

variable "mesh_inventory_image" {
  description = "Container image for the inventory service."
  type        = string
  default     = ""
}

variable "mesh_fraud_image" {
  description = "Container image for the fraud service."
  type        = string
  default     = ""
}

variable "mesh_payment_image" {
  description = "Container image for the payment service."
  type        = string
  default     = ""
}

variable "mesh_ledger_image" {
  description = "Container image for the ledger service."
  type        = string
  default     = ""
}

variable "mesh_projection_image" {
  description = "Container image for the projection-worker service."
  type        = string
  default     = ""
}

#─── Load generator ───────────────────────────────────────────────────────────
variable "enable_loadgen" {
  description = "Deploy the load generator (control API + trickle CronJob). Requires enable_mesh."
  type        = bool
  default     = false
}

variable "mesh_loadgen_image" {
  description = "Container image for the loadgen service."
  type        = string
  default     = ""
}

variable "loadgen_enable_trickle" {
  description = "Run the steady-trickle CronJob so the service map is never empty."
  type        = bool
  default     = true
}

variable "loadgen_trickle_rps" {
  type    = number
  default = 3
}

variable "loadgen_trickle_duration_seconds" {
  type    = number
  default = 60
}

variable "enable_chaos_mesh" {
  description = "Install Chaos Mesh for fault injection (Argus bench scenarios, game days). Exempts its namespace from the cluster-wide Gatekeeper constraints while on. See docs/runbooks/chaos-mesh.md."
  type        = bool
  default     = false
}

variable "loadgen_enable_chaos" {
  description = "Grant loadgen namespace-scoped pod-delete RBAC + expose /chaos/kill for real pod-kill fault injection (#143). OFF by default; app guards (mesh allowlist + dry-run default) still apply when on."
  type        = bool
  default     = false
}

variable "permissions_boundary_arn" {
  description = "Workload permissions boundary when use_remote_state_foundation is false (otherwise the foundation output is used)"
  type        = string
  default     = null
}

variable "enable_image_signature_policy" {
  description = "Require order-api images signed by this repository's app.yml on main (Sigstore policy-controller). docs/runbooks/image-signature-policy.md."
  type        = bool
  default     = false
}

variable "image_signature_policy_mode" {
  description = "warn (report, admit) or enforce (refuse unsigned order-api images)"
  type        = string
  default     = "warn"
}

variable "storefront_subdomain" {
  description = "The storefront's host is <storefront_subdomain>.<domain_name>"
  type        = string
  default     = "shop"
}
