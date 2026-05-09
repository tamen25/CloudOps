#This file defines variables settings for CloudOps.
#Observability Module Variables

variable "name_prefix" {
  description = "Prefix for resource names (e.g., cloudops)"
  type        = string
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the region input value.
variable "region" {
  description = "AWS region"
  type        = string
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID used for globally unique S3 bucket names"
  type        = string
}

#Defines the EKS cluster name input value.
variable "eks_cluster_name" {
  description = "EKS cluster name — added as a resource attribute to all OTel telemetry"
  type        = string
}

#Defines the OIDC provider arn input value.
variable "oidc_provider_arn" {
  description = "OIDC provider ARN for IRSA trust policies (from eks module)"
  type        = string
}

#Defines the OIDC provider URL input value.
variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// (from eks module output oidc_provider_url)"
  type        = string
}

#Defines the acm cert arn input value.
variable "acm_cert_arn" {
  description = "ACM wildcard certificate ARN for HTTPS ingresses (from ingress module)"
  type        = string
}

#Defines the domain input value.
variable "domain" {
  description = "Root domain for observability ingress hostnames (e.g. example.com)"
  type        = string
}

#Backlog #61 — opt-in publication of OTel ingestion config to SSM.
variable "publish_otel_ssm_config" {
  description = "When true, publish OTel endpoint URLs and bearer token to SSM Parameter Store under /<name_prefix>/<environment>/otel/* for SDK/client discovery."
  type        = bool
  default     = false
}

#Defines the SSM KMS key ID input value.
variable "ssm_kms_key_id" {
  description = "Optional KMS key ID/alias/ARN for SecureString SSM parameters. Empty (default) uses alias/aws/ssm."
  type        = string
  default     = ""
}

#Defines the application namespace input value.
variable "application_namespace" {
  description = "Kubernetes namespace where application workloads run"
  type        = string
  default     = "cloudops"
}

#── OTel ingestion exposure (closes backlog #38) ─────────────────────────────
#Production should set `otel_ingestion_internal = true` so the cloudops-otel
#ALB is internal-only (reachable from VPC peers / Transit Gateway / Direct
#Connect, not the internet). If you must keep internet exposure, populate
#`otel_allowed_cidrs` with a tight list AND document the rotation cadence for
#the bearer token in the runbook.

variable "otel_ingestion_internal" {
  description = "When true, the cloudops-otel ALB is provisioned as `internal` (no public IP). Production default."
  type        = bool
  default     = false
}

#Defines the OTel allowed cidrs input value.
variable "otel_allowed_cidrs" {
  description = "Source CIDRs allowed to reach the OTel ingestion ALB. Empty = no CIDR allow-list (bearer token + WAF rate limit only)."
  type        = list(string)
  default     = []
}

#Defines the OTel rate limit per 5min input value.
variable "otel_rate_limit_per_5min" {
  description = "Per-IP rate limit applied at the cloudops-otel ALB via WAFv2. 0 = WAF not attached. Production: ~60000 (200 req/s)."
  type        = number
  default     = 0
}

#Defines the OTel token rotation days input value.
variable "otel_token_rotation_days" {
  description = "Days between rotation of the OTel collector bearer token (used by `secrets.tf`'s rotation marker). 0 = manual rotation only."
  type        = number
  default     = 0
}

#Defines the OTel alb DNS name input value.
variable "otel_alb_dns_name" {
  description = "DNS name of the cloudops-otel ALB. Empty on the first pass; populated after the LBC creates the ALB. Acts as the two-pass marker for the OTel WAF association — we cannot look up the ALB by tag until it exists. Closes backlog #38."
  type        = string
  default     = ""
}

#Defines the enable alertmanager input value.
variable "enable_alertmanager" {
  description = "Run kube-prometheus-stack's Alertmanager pod. Required for the Grafana Alertmanager datasource to return data. Adds ~50m CPU / ~100Mi RAM."
  type        = bool
  default     = false
}

#── Grafana unified alerting ──────────────────────────────────────────────────

variable "alert_email" {
  description = "Email address for Grafana alert notifications. Empty = no email contact point provisioned."
  type        = string
  default     = ""
}

#Defines the alert sns topic arn input value.
variable "alert_sns_topic_arn" {
  description = "SNS topic ARN for alert delivery (informational — wired to alert_webhook_url via API Gateway when set). Empty = no SNS integration."
  type        = string
  default     = ""
}

#Defines the alert webhook URL input value.
variable "alert_webhook_url" {
  description = "HTTPS webhook URL that fronts the SNS topic (e.g. API Gateway → SNS Publish) or any other receiver (Slack incoming webhook, PagerDuty Events v2). Empty = no webhook contact point provisioned."
  type        = string
  default     = ""
}

#Defines the tags input value.
variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

#─── Bucket hardening ─────────────────────────────────────────────────────────
#Defaults are dev-friendly (force_destroy=true, no versioning, no replication,
#AES-256 instead of CMK). prod.tfvars flips these to the durable settings.

variable "buckets_force_destroy" {
  description = "Allow `terraform destroy` to nuke observability buckets even if they contain objects. true = dev/test (disposable). false = prod (must empty manually)."
  type        = bool
  default     = true
}

#Defines the buckets versioning input value.
variable "buckets_versioning" {
  description = "Enable S3 object versioning on Loki/Tempo/Mimir buckets. Prevents accidental overwrite or delete; required for replication."
  type        = bool
  default     = false
}

#Defines the buckets KMS cmk input value.
variable "buckets_kms_cmk" {
  description = "Use a per-domain customer-managed KMS key (CMK) for SSE on observability buckets instead of AES-256. Enables key rotation + audit."
  type        = bool
  default     = false
}

#Defines the buckets replication destination arn input value.
variable "buckets_replication_destination_arn" {
  description = "S3 bucket ARN in another region to replicate observability data to. Empty = no replication. Requires buckets_versioning=true and a replication IAM role; passed in via buckets_replication_role_arn."
  type        = string
  default     = ""
}

#Defines the buckets replication role arn input value.
variable "buckets_replication_role_arn" {
  description = "IAM role ARN with s3:Replicate* + KMS:Decrypt on source/destination buckets. Required when buckets_replication_destination_arn is set."
  type        = string
  default     = ""
}

#Defines the buckets expiration days input value.
variable "buckets_expiration_days" {
  description = "Days after which observability bucket objects (already in Glacier) are deleted. 0 = never expire. Defaults to 365d in prod-shaped setups."
  type        = number
  default     = 0

  validation {
    condition     = var.buckets_expiration_days >= 0
    error_message = "buckets_expiration_days must be 0 (no expiration) or positive."
  }
}

#Defines the buckets glacier transition days input value.
variable "buckets_glacier_transition_days" {
  description = "Days after which objects transition to Glacier. 0 = no transition (keep in Standard)."
  type        = number
  default     = 30
}

#─── Long-term metrics storage ────────────────────────────────────────────────

variable "metrics_long_term_storage" {
  description = "Long-term Prometheus storage backend. \"none\" = local PVC only (15d retention). \"mimir\" = remote_write to Mimir + S3 (recommended). \"thanos\" = sidecar + S3 (alternative)."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "mimir", "thanos"], var.metrics_long_term_storage)
    error_message = "metrics_long_term_storage must be one of: none, mimir, thanos."
  }
}

#─── HA replicas (defaults stay dev-friendly) ─────────────────────────────────

variable "loki_replication_factor" {
  description = "Loki write-path replication factor. 1 = dev (single point of loss). 3 = prod (HA writes)."
  type        = number
  default     = 1

  validation {
    condition     = var.loki_replication_factor >= 1
    error_message = "loki_replication_factor must be at least 1."
  }
}

#Defines the loki write replicas input value.
variable "loki_write_replicas" {
  description = "Number of Loki write pods. Should be >= loki_replication_factor for replication to work."
  type        = number
  default     = 2
}

#Defines the loki read replicas input value.
variable "loki_read_replicas" {
  description = "Number of Loki read pods."
  type        = number
  default     = 2
}

#Defines the prometheus replicas input value.
variable "prometheus_replicas" {
  description = "Number of Prometheus replicas. 1 = dev. 2+ = HA. Replicas are zone-spread automatically by the operator."
  type        = number
  default     = 1
}

#Defines the prometheus retention input value.
variable "prometheus_retention" {
  description = "Local Prometheus TSDB retention. Drop to 6h once Mimir/Thanos owns long-term."
  type        = string
  default     = "15d"
}

#Defines the tempo ingester replicas input value.
variable "tempo_ingester_replicas" {
  description = "Number of Tempo ingester replicas. 1 = dev. 3 = prod."
  type        = number
  default     = 1
}

#Defines the tempo metrics generator enabled input value.
variable "tempo_metrics_generator_enabled" {
  description = "Enable Tempo's metrics-generator to derive RED metrics from spans. Requires Prometheus remote_write."
  type        = bool
  default     = false
}

#─── SLO Targets ─────────────────────────────────────────────────────────────

variable "slo_availability_target" {
  description = "Availability SLO target as a decimal (e.g. 0.999 = 99.9%). Used in PrometheusRule burn-rate expressions and error budget calculations."
  type        = number
  default     = 0.999

  validation {
    condition     = var.slo_availability_target > 0 && var.slo_availability_target < 1
    error_message = "slo_availability_target must be a decimal between 0 and 1 (e.g. 0.999 for 99.9%)."
  }
}

#Defines the SLO latency target input value.
variable "slo_latency_target" {
  description = "Latency SLO target as a decimal — proportion of requests that must complete in <300ms (e.g. 0.95 = 95%). Used in PrometheusRule burn-rate expressions and error budget calculations."
  type        = number
  default     = 0.95

  validation {
    condition     = var.slo_latency_target > 0 && var.slo_latency_target < 1
    error_message = "slo_latency_target must be a decimal between 0 and 1 (e.g. 0.95 for 95%)."
  }
}

#── yace (CloudWatch exporter) ────────────────────────────────────────────────

variable "enable_yace" {
  description = "Deploy yet-another-cloudwatch-exporter to scrape AWS/RDS, AWS/ApplicationELB, AWS/NATGateway, AWS/Lambda metrics into Prometheus. Closes backlog #14."
  type        = bool
  default     = false
}
