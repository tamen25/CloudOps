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

# Compatibility with the shared root terraform.tfvars file.
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

# Upstream state wiring. scripts/tf-init.sh writes these into backend.auto.tfvars.
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

# Explicit fallback inputs for migration or bring-your-own upstream resources.
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

# Ingress and ALB follow-up inputs.
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

# Observability.
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

# SLO.
variable "slo_prometheus_url" {
  type    = string
  default = ""
}

variable "slo_grafana_api_key_secret_arn" {
  type    = string
  default = ""
}

# Security and automation.
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

# FinOps.
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
