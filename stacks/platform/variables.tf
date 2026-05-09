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
