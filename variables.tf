#This file defines variables settings for CloudOps.
#CloudOps - Root Variables
#Centralized variable definitions for all modules

#Module Toggle Controls

variable "enable_networking" {
  description = "Enable/disable networking module deployment"
  type        = bool
  default     = false
}

#Defines the enable EKS input value.
variable "enable_eks" {
  description = "Enable/disable EKS module deployment"
  type        = bool
  default     = false
}

#Defines the enable database input value.
variable "enable_database" {
  description = "Enable/disable database module deployment"
  type        = bool
  default     = false
}

#Defines the enable ingress input value.
variable "enable_ingress" {
  description = "Enable/disable ingress module deployment (requires EKS cluster to exist first)"
  type        = bool
  default     = false
}

#Defines the enable observability input value.
variable "enable_observability" {
  description = "Enable/disable observability module (LGTM stack — requires enable_eks and enable_ingress first)"
  type        = bool
  default     = false
}

#Defines the enable SLO input value.
variable "enable_slo" {
  description = "Enable/disable SLO module (Lambda error budget tracker + DynamoDB — requires enable_observability first)"
  type        = bool
  default     = false
}

#Defines the enable security input value.
variable "enable_security" {
  description = "Enable/disable security module (Falco runtime threat detection + compliance scanner — requires enable_eks and enable_observability first)"
  type        = bool
  default     = false
}

#Defines the enable finops input value.
variable "enable_finops" {
  description = "Enable/disable FinOps module (Cost Explorer ingestion, anomaly detection, AWS Budgets — standalone, no other modules required)"
  type        = bool
  default     = false
}

#Defines the enable codeartifact input value.
variable "enable_codeartifact" {
  description = "Enable/disable CodeArtifact domain and package repositories for CloudOps client libraries."
  type        = bool
  default     = false
}

#Defines the enable self healing input value.
variable "enable_self_healing" {
  description = "Enable/disable self-healing module (CloudWatch Alarm-driven automated remediation — requires enable_eks and enable_observability first)"
  type        = bool
  default     = false
}

#Defines the self healing alb arn suffix input value.
variable "self_healing_alb_arn_suffix" {
  description = "ALB ARN suffix for CloudWatch ALB metric dimensions (last two path segments). Set after first ingress deploy. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

#Defines the self healing target group arn suffix input value.
variable "self_healing_target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch ALB target metrics. Set after first ingress deploy. Leave empty to skip ALB alarms."
  type        = string
  default     = ""
}

#Defines the self healing min healthy pods input value.
variable "self_healing_min_healthy_pods" {
  description = "Minimum healthy order-api pods — triggers scale-out healing when count drops below this"
  type        = number
  default     = 2
}

#Defines the self healing max scale out pods input value.
variable "self_healing_max_scale_out_pods" {
  description = "Maximum pods the self-healing controller may scale out to in a single healing action"
  type        = number
  default     = 10
}

#Defines the self healing rollback on error rate input value.
variable "self_healing_rollback_on_error_rate" {
  description = "5xx error rate percentage threshold (0-100) that triggers an automatic rollback of order-api"
  type        = number
  default     = 5
}

#Defines the self healing dry run input value.
variable "self_healing_dry_run" {
  description = "When true, the self-healing Lambda logs actions but does not execute them. Safe for initial testing."
  type        = bool
  default     = false
}

#Defines the cost budget monthly usd input value.
variable "cost_budget_monthly_usd" {
  description = "Monthly cost budget in USD — triggers WARNING alert at 80% and CRITICAL alert at 100%"
  type        = number
  default     = 50
}

#Defines the cost alert email input value.
variable "cost_alert_email" {
  description = "Email address for SNS cost alert subscriptions (budget threshold + anomaly alerts). Leave empty to skip."
  type        = string
  default     = ""
}

#Defines the cost anomaly threshold percent input value.
variable "cost_anomaly_threshold_percent" {
  description = "Percentage increase over 7-day average that triggers a cost anomaly alert per service"
  type        = number
  default     = 20
}

#FinOps hard-cap stop-loss (#139).
variable "enable_budget_hardcap_action" {
  description = "Attach a deny-policy budget action when ACTUAL spend crosses budget_hardcap_threshold_percent. OFF by default. Requires budget_hardcap_target_role_names."
  type        = bool
  default     = false
}

#Defines the budget hard-cap threshold percent input value.
variable "budget_hardcap_threshold_percent" {
  description = "Percentage of cost_budget_monthly_usd at which the hard-cap deny policy applies. Sit above the 100% CRITICAL alert (default 120%)."
  type        = number
  default     = 120
}

#Defines the budget hard-cap target role names input value.
variable "budget_hardcap_target_role_names" {
  description = "IAM role NAMES the hard-cap deny policy attaches to (e.g. the GitHub Actions deploy role). Empty disables the action."
  type        = list(string)
  default     = []
}

#Defines the enable alertmanager input value.
variable "enable_alertmanager" {
  description = "Enable the kube-prometheus-stack Alertmanager pod. Required for SLO PrometheusRule alerts to surface in the Grafana unified Alerts UI via the Alertmanager datasource."
  type        = bool
  default     = false
}

#Defines the enable yace input value.
variable "enable_yace" {
  description = "Deploy yet-another-cloudwatch-exporter (yace) into the monitoring namespace to scrape AWS/RDS, AWS/ApplicationELB, AWS/NATGateway, AWS/Lambda metrics into Prometheus. Closes backlog #14. Requires enable_observability."
  type        = bool
  default     = false
}

#── Observability bucket hardening ────────────────────────────────────────────
#Defaults are dev-friendly. Flip these in environments/prod.tfvars.

variable "buckets_force_destroy" {
  description = "Allow `terraform destroy` to nuke observability buckets even if they contain objects. true = dev/test. false = prod."
  type        = bool
  default     = true
}

#Defines the buckets versioning input value.
variable "buckets_versioning" {
  description = "Enable S3 object versioning on Loki/Tempo/Mimir buckets. Required for replication."
  type        = bool
  default     = false
}

#Defines the buckets KMS cmk input value.
variable "buckets_kms_cmk" {
  description = "Use a per-domain customer-managed KMS key for SSE on observability buckets instead of AES-256."
  type        = bool
  default     = false
}

#Defines the buckets replication destination arn input value.
variable "buckets_replication_destination_arn" {
  description = "S3 bucket ARN in another region for cross-region replication. Empty = no replication."
  type        = string
  default     = ""
}

#Defines the buckets replication role arn input value.
variable "buckets_replication_role_arn" {
  description = "IAM role ARN with s3:Replicate* permissions. Required when buckets_replication_destination_arn is set."
  type        = string
  default     = ""
}

#Defines the buckets glacier transition days input value.
variable "buckets_glacier_transition_days" {
  description = "Days after which observability bucket objects transition to Glacier. 0 = no transition."
  type        = number
  default     = 30
}

#Defines the buckets expiration days input value.
variable "buckets_expiration_days" {
  description = "Days after which observability bucket objects are deleted. 0 = never."
  type        = number
  default     = 0
}

#── Long-term metrics storage ─────────────────────────────────────────────────

variable "metrics_long_term_storage" {
  description = "Long-term Prometheus storage backend. \"none\" = local PVC only. \"mimir\" = remote_write to Mimir + S3 (recommended). \"thanos\" = sidecar + S3 (alternative)."
  type        = string
  default     = "none"

  validation {
    condition     = contains(["none", "mimir", "thanos"], var.metrics_long_term_storage)
    error_message = "metrics_long_term_storage must be one of: none, mimir, thanos."
  }
}

#── Observability HA replicas ─────────────────────────────────────────────────

variable "loki_replication_factor" {
  description = "Loki write-path replication factor. 1 = dev. 3 = prod."
  type        = number
  default     = 1
}

#Defines the loki write replicas input value.
variable "loki_write_replicas" {
  description = "Number of Loki write pods. >= loki_replication_factor."
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
  description = "Number of Prometheus replicas. 1 = dev. 2+ = HA, zone-spread."
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
  description = "Enable Tempo's metrics-generator (RED metrics from spans). Requires Prometheus remote_write."
  type        = bool
  default     = false
}

#── RDS Secrets Manager rotation ──────────────────────────────────────────────

variable "database_rotation_enabled" {
  description = "Enable automatic rotation of the DB credential secret in Secrets Manager. Requires database_rotation_lambda_arn."
  type        = bool
  default     = false
}

#Defines the database rotation lambda arn input value.
variable "database_rotation_lambda_arn" {
  description = "Rotation Lambda ARN. Deploy AWS SAR's SecretsManagerRDSPostgreSQLRotationSingleUser and pass the resulting Lambda ARN here. Leave empty when database_rotation_lambda_auto_deploy = true."
  type        = string
  default     = ""
}

#Defines the database rotation lambda auto deploy input value.
variable "database_rotation_lambda_auto_deploy" {
  description = "When true and database_rotation_lambda_arn is empty, the database module auto-deploys the SAR rotation app via CloudFormation. Closes the manual SAR-deploy step."
  type        = bool
  default     = false
}

#Defines the database rotation days input value.
variable "database_rotation_days" {
  description = "Days between automatic credential rotations."
  type        = number
  default     = 30
}

#Defines the database secret recovery window days input value.
variable "database_secret_recovery_window_days" {
  description = "Days the deleted DB-credential secret remains recoverable. 0 = immediate (test envs only)."
  type        = number
  default     = 7
}

#── AWS Backup ────────────────────────────────────────────────────────────────

variable "enable_backup" {
  description = "Deploy AWS Backup vault + plan covering RDS and tagged EBS volumes."
  type        = bool
  default     = false
}

#Defines the backup vault lock enabled input value.
variable "backup_vault_lock_enabled" {
  description = "Enable AWS Backup vault lock (compliance mode). NEVER true in test envs — locked vaults cannot be destroyed until min_retention_days expires."
  type        = bool
  default     = false
}

#Defines the backup vault lock min retention days input value.
variable "backup_vault_lock_min_retention_days" {
  description = "Minimum retention days for vault lock."
  type        = number
  default     = 7
}

#Defines the backup vault lock max retention days input value.
variable "backup_vault_lock_max_retention_days" {
  description = "Maximum retention days for vault lock."
  type        = number
  default     = 365
}

#Defines the backup daily retention days input value.
variable "backup_daily_retention_days" {
  description = "Days to retain daily backups."
  type        = number
  default     = 7
}

#Defines the backup weekly retention days input value.
variable "backup_weekly_retention_days" {
  description = "Days to retain weekly backups."
  type        = number
  default     = 30
}

#Defines the backup monthly retention days input value.
variable "backup_monthly_retention_days" {
  description = "Days to retain monthly backups."
  type        = number
  default     = 365
}

#── WAFv2 ─────────────────────────────────────────────────────────────────────

variable "enable_waf" {
  description = "Attach a regional WAFv2 web ACL to the public ALB. Default-allow with managed rule groups + rate limit + optional geo block."
  type        = bool
  default     = false
}

#Defines the WAF rate limit per 5min input value.
variable "waf_rate_limit_per_5min" {
  description = "WAF per-IP rate limit (requests per 5 minutes)."
  type        = number
  default     = 2000
}

#Defines the WAF geo block countries input value.
variable "waf_geo_block_countries" {
  description = "ISO 3166-1 alpha-2 country codes to block at the WAF. Empty = no geo block."
  type        = list(string)
  default     = []
}

#Defines the WAF logging enabled input value.
variable "waf_logging_enabled" {
  description = "Send WAF sampled blocked-request logs to a dedicated CloudWatch log group."
  type        = bool
  default     = true
}

#Closes backlog #102. Pass-through to modules/ingress/waf.tf retention.
variable "waf_log_retention_days" {
  description = "WAF CloudWatch log retention in days. 30 = dev, 90 = staging, 365 = prod (typical)."
  type        = number
  default     = 30
}

#── Compliance (CloudTrail / GuardDuty / Config / Security Hub) ───────────────

variable "enable_compliance" {
  description = "Master toggle for the compliance module wrapper. Each sub-service has its own toggle below."
  type        = bool
  default     = false
}

#Defines the enable cloudtrail input value.
variable "enable_cloudtrail" {
  description = "Deploy a multi-region CloudTrail with log file validation."
  type        = bool
  default     = false
}

#Defines the cloudtrail object lock enabled input value.
variable "cloudtrail_object_lock_enabled" {
  description = "Enable S3 Object Lock on the CloudTrail bucket (compliance mode). NEVER true in test envs — locked objects cannot be deleted until retention expires."
  type        = bool
  default     = false
}

#Defines the cloudtrail object lock retention days input value.
variable "cloudtrail_object_lock_retention_days" {
  description = "Object Lock retention period for CloudTrail logs."
  type        = number
  default     = 90
}

#Defines the enable guardduty input value.
variable "enable_guardduty" {
  description = "Enable GuardDuty for the account."
  type        = bool
  default     = false
}

#Defines the guardduty EKS protection input value.
variable "guardduty_eks_protection" {
  description = "Enable GuardDuty EKS Audit Logs + Runtime Monitoring."
  type        = bool
  default     = true
}

#Defines the guardduty s3 protection input value.
variable "guardduty_s3_protection" {
  description = "Enable GuardDuty S3 Protection."
  type        = bool
  default     = true
}

#Defines the guardduty malware protection input value.
variable "guardduty_malware_protection" {
  description = "Enable GuardDuty Malware Protection for EBS volumes."
  type        = bool
  default     = false
}

#Defines the enable config input value.
variable "enable_config" {
  description = "Deploy AWS Config recorder + delivery channel."
  type        = bool
  default     = false
}

#Defines the config conformance packs input value.
variable "config_conformance_packs" {
  description = "Conformance pack templates to deploy. Each entry needs a name and template_s3_uri."
  type = list(object({
    name            = string
    template_s3_uri = string
  }))
  default = []
}

#Defines the enable security hub input value.
variable "enable_security_hub" {
  description = "Enable Security Hub with the specified standards subscribed."
  type        = bool
  default     = false
}

#Defines the enable external secrets input value.
variable "enable_external_secrets" {
  description = "Install External Secrets Operator (pulls AWS Secrets Manager values into k8s Secrets via IRSA)."
  type        = bool
  default     = false
}

#Defines the external secrets allowed arns input value.
variable "external_secrets_allowed_arns" {
  description = "Secrets Manager ARNs (or ARN wildcards) the External Secrets Operator IRSA may read. Empty = legacy account-wide `*` (only for bootstrap)."
  type        = list(string)
  default     = []
}

#Defines the security hub standards input value.
variable "security_hub_standards" {
  description = "Security Hub standard ARNs to subscribe to."
  type        = list(string)
  default = [
    "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0",
    "arn:aws:securityhub:::standards/aws-foundational-security-best-practices/v/1.0.0",
  ]
}

#Defines the grafana alert webhook URL input value.
variable "grafana_alert_webhook_url" {
  description = "HTTPS webhook for Grafana unified-alerting notifications (Slack, PagerDuty Events v2, or API Gateway → SNS). Empty = no webhook contact point."
  type        = string
  default     = ""
}

#Defines the security alert email input value.
variable "security_alert_email" {
  description = "Email address for SNS security alert subscriptions — receives all severity findings from the compliance scanner. Leave empty to skip."
  type        = string
  default     = ""
}

#Defines the security critical email input value.
variable "security_critical_email" {
  description = "Email address for HIGH/CRITICAL-only SNS alerts (pager / on-call inbox). Leave empty to skip."
  type        = string
  default     = ""
}

#github_token stores the actual PAT value (sensitive).
#When provided, the bootstrap module creates an aws_secretsmanager_secret and the
#ARN is automatically wired to the security module. This is the preferred approach.
#
#If you have an existing secret ARN, leave github_token empty and set
#security_github_token_secret_arn to the ARN directly instead.
variable "github_token" {
  description = "GitHub personal access token with repo scope — bootstrap stores it in Secrets Manager so the auto-remediation Lambda can create GitHub issues. Leave empty to skip or use security_github_token_secret_arn for an existing secret."
  type        = string
  sensitive   = true
  default     = ""
}

#Defines the security github token secret arn input value.
variable "security_github_token_secret_arn" {
  description = "Existing Secrets Manager ARN for a GitHub PAT — used when the secret is managed outside Terraform. Takes effect only when github_token is empty."
  type        = string
  default     = ""
}

#Defines the security github repo input value.
variable "security_github_repo" {
  description = "GitHub repository in owner/name format where the auto-remediation Lambda creates security issues"
  type        = string
  default     = ""
}

#Defines the SLO grafana API key secret arn input value.
variable "slo_grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN for the Grafana API key used by the SLO Lambda. Required when prometheus_url is the Grafana datasource proxy."
  type        = string
  default     = ""
}

#Defines the SLO prometheus URL input value.
variable "slo_prometheus_url" {
  description = "Override Prometheus URL for the SLO module when enable_observability=false. Defaults to the observability module output when enable_observability=true."
  type        = string
  default     = ""
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID — used for globally unique S3 bucket names in the observability module"
  type        = string
  default     = ""
}

#Defines the alb DNS name input value.
variable "alb_dns_name" {
  description = "DNS name of the public `cloudops` ALB (api + grafana). Populated after the LBC creates it on first deploy. Closes backlog #17."
  type        = string
  default     = ""
}

#Defines the alb zone ID input value.
variable "alb_zone_id" {
  description = "Hosted zone ID of the public `cloudops` ALB."
  type        = string
  default     = ""
}

#Defines the OTel alb DNS name input value.
variable "otel_alb_dns_name" {
  description = "DNS name of the `cloudops-otel` ALB (gRPC OTel ingestion). Populated after the LBC creates it. Empty = otel.<domain> Route 53 record is skipped."
  type        = string
  default     = ""
}

#Defines the OTel alb zone ID input value.
variable "otel_alb_zone_id" {
  description = "Hosted zone ID of the `cloudops-otel` ALB."
  type        = string
  default     = ""
}

#── OTel ingestion hardening (closes backlog #38) ────────────────────────────

variable "otel_ingestion_internal" {
  description = "When true, the cloudops-otel ALB is provisioned as `internal` (no public IP). Production: true. Customer apps reach the collector via VPC peering / Transit Gateway / Direct Connect."
  type        = bool
  default     = false
}

#Defines the OTel allowed cidrs input value.
variable "otel_allowed_cidrs" {
  description = "Source CIDRs allowed to reach the OTel ingestion ALB. Empty = no allow-list (rely on bearer token + WAF rate limit)."
  type        = list(string)
  default     = []
}

#Defines the OTel rate limit per 5min input value.
variable "otel_rate_limit_per_5min" {
  description = "Per-IP rate limit applied at the cloudops-otel ALB via WAFv2. 0 = WAF not attached."
  type        = number
  default     = 0
}

#Defines the OTel token rotation days input value.
variable "otel_token_rotation_days" {
  description = "Days between rotation of the OTel collector bearer token. 0 = manual rotation only."
  type        = number
  default     = 0
}

#Backlog #61 — publish OTel ingestion config to SSM Parameter Store.
variable "publish_otel_ssm_config" {
  description = "When true, publish OTel endpoint URLs and bearer token to SSM under /<project>/<env>/otel/* for SDK/client discovery."
  type        = bool
  default     = false
}

#Defines the SSM KMS key ID input value.
variable "ssm_kms_key_id" {
  description = "Optional KMS key ID/alias/ARN for SecureString SSM parameters. Empty = AWS-managed alias/aws/ssm."
  type        = string
  default     = ""
}

#Defines the destroy all input value.
variable "destroy_all" {
  description = "DANGER: Set to true to destroy ALL infrastructure including bootstrap. Set networking and eks to false first!"
  type        = bool
  default     = false
}

#General Configuration

variable "region" {
  description = "AWS region for resource deployment"
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.region))
    error_message = "Region must be a valid AWS region (e.g., us-east-1)."
  }
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name (e.g., dev, staging, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

#Defines the project name input value.
variable "project_name" {
  description = "Project name for resource naming and tagging"
  type        = string

  validation {
    condition     = length(var.project_name) > 0 && length(var.project_name) <= 32
    error_message = "Project name must be between 1 and 32 characters."
  }
}

#Defines the owner input value.
variable "owner" {
  description = "Owner or team responsible for resources"
  type        = string
  default     = ""
}

#Defines the domain name input value.
variable "domain_name" {
  description = "Root domain used for ACM wildcard cert, Route 53 hosted zone, ingress hostnames, and default URLs. Must be a domain you control."
  type        = string

  validation {
    condition     = length(var.domain_name) > 0
    error_message = "domain_name is required — set it to a domain you own (e.g. example.com)."
  }
}

#Networking Module Variables

variable "az_count" {
  description = "Number of Availability Zones to use (will be capped at 3 for cost optimization)"
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 1 && var.az_count <= 6
    error_message = "AZ count must be between 1 and 6."
  }
}

#Defines the VPC cidr input value.
variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

#Defines the public subnet cidrs input value.
variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.public_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All public subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

#Defines the private subnet cidrs input value.
variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.private_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All private subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

#Defines the database subnet cidrs input value.
variable "db_subnet_cidrs" {
  description = "List of CIDR blocks for database subnets. If null, will be auto-generated from vpc_cidr"
  type        = list(string)
  default     = null

  validation {
    condition = alltrue([
      for cidr in coalesce(var.db_subnet_cidrs, []) : can(cidrhost(cidr, 0))
    ])
    error_message = "All database subnet CIDRs must be valid IPv4 CIDR blocks."
  }
}

#Defines the enable nat gateway input value.
variable "enable_nat_gateway" {
  description = <<-EOT
    Enable NAT gateways for private subnet internet access.
    When true, creates one NAT gateway per AZ for high availability.
    Set to false in dev environments to save costs (~$32/month per NAT gateway).
  EOT
  type        = bool
  default     = true
}

#Defines the enable flow logs input value.
variable "enable_flow_logs" {
  description = "Enable VPC Flow Logs for network monitoring and troubleshooting"
  type        = bool
  default     = false
}

#Defines the flow logs destination input value.
variable "flow_logs_destination" {
  description = "VPC flow logs target. \"cloudwatch\" = quick + queryable. \"s3\" = parquet + Athena partitioning, cheaper at scale."
  type        = string
  default     = "cloudwatch"

  validation {
    condition     = contains(["cloudwatch", "s3"], var.flow_logs_destination)
    error_message = "flow_logs_destination must be one of: cloudwatch, s3."
  }
}

#Defines the flow logs retention days input value.
variable "flow_logs_retention_days" {
  description = "Number of days to retain VPC Flow Logs in CloudWatch"
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.flow_logs_retention_days)
    error_message = "Flow logs retention must be a valid CloudWatch Logs retention period."
  }
}

#Defines the allowed cidr blocks input value.
variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access ALB (e.g., ['0.0.0.0/0'] for public access)"
  type        = list(string)
  default     = ["0.0.0.0/0"]

  validation {
    condition = alltrue([
      for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))
    ])
    error_message = "All allowed CIDR blocks must be valid IPv4 CIDR blocks."
  }
}

#Defines the enable HTTPS input value.
variable "enable_https" {
  description = "Enable HTTPS (port 443) on the ALB security group"
  type        = bool
  default     = true
}

#Defines the enable HTTP input value.
variable "enable_http" {
  description = "Enable HTTP (port 80) on the ALB security group"
  type        = bool
  default     = true
}

#Defines the custom alb ports input value.
variable "custom_alb_ports" {
  description = "Additional custom ports to open on the ALB security group"
  type        = list(number)
  default     = []

  validation {
    condition = alltrue([
      for port in var.custom_alb_ports : port >= 1 && port <= 65535
    ])
    error_message = "All custom ports must be between 1 and 65535."
  }
}

#Defines the RDS port input value.
variable "rds_port" {
  description = "Port for RDS database (default 5432 for PostgreSQL)"
  type        = number
  default     = 5432

  validation {
    condition     = var.rds_port >= 1 && var.rds_port <= 65535
    error_message = "RDS port must be between 1 and 65535."
  }
}

#EKS Module Variables

variable "eks_kubernetes_version" {
  description = "Kubernetes version for the EKS cluster"
  type        = string
  default     = "1.32"
}

#Defines the EKS node instance types input value.
variable "eks_node_instance_types" {
  description = "EC2 instance types for the EKS managed node group"
  type        = list(string)
  default     = ["t3.large"]
}

#Defines the EKS node min size input value.
variable "eks_node_min_size" {
  description = "Minimum number of nodes in the EKS node group"
  type        = number
  default     = 2
}

#Defines the EKS node max size input value.
variable "eks_node_max_size" {
  description = "Maximum number of nodes in the EKS node group"
  type        = number
  default     = 6
}

#Defines the EKS node desired size input value.
variable "eks_node_desired_size" {
  description = "Desired number of nodes in the EKS node group"
  type        = number
  default     = 2
}

#Defines the EKS node capacity type input value.
variable "eks_node_capacity_type" {
  description = "EKS node group capacity type — ON_DEMAND (default) or SPOT. SPOT can cut node cost 40-70% for stateless dev workloads at the cost of 2-minute interruption notices."
  type        = string
  default     = "ON_DEMAND"
}

#── EKS control-plane endpoint exposure (backlog #42) ────────────────────────

variable "eks_endpoint_private_access" {
  description = "Enable EKS control plane access from inside the VPC."
  type        = bool
  default     = true
}

#Defines the EKS endpoint public access input value.
variable "eks_endpoint_public_access" {
  description = "Enable EKS control plane access from the internet. Production: set false and reach the API server via VPN / bastion / private runners."
  type        = bool
  default     = true
}

#Defines the EKS endpoint public access cidrs input value.
variable "eks_endpoint_public_access_cidrs" {
  description = "CIDR blocks allowed to reach the public EKS endpoint. Default `0.0.0.0/0` matches the dev flow. Tighten for prod."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

#Defines the order API namespace input value.
variable "order_api_namespace" {
  description = "Kubernetes namespace for the order-api service account (IRSA)"
  type        = string
  default     = "cloudops"
}

#Defines the order API service account input value.
variable "order_api_service_account" {
  description = "Kubernetes service account name for order-api IRSA"
  type        = string
  default     = "order-api"
}

#Defines the order API API key secret arn input value.
variable "order_api_api_key_secret_arn" {
  description = "Secrets Manager ARN for the order-api X-Api-Key (consumed by app via API_KEY_SECRET_ARN). When set, the IRSA policy allows reading this exact ARN. Leave empty to skip."
  type        = string
  default     = ""
}

#Existing Infrastructure (for EKS-only deployments without networking module)

variable "existing_vpc_id" {
  description = "Existing VPC ID (required if enable_networking is false and enable_eks is true)"
  type        = string
  default     = ""
}

#Defines the existing private subnet ids input value.
variable "existing_private_subnet_ids" {
  description = "Existing private subnet IDs (required if enable_networking is false and enable_eks is true)"
  type        = list(string)
  default     = []
}

#Defines the existing public subnet ids input value.
variable "existing_public_subnet_ids" {
  description = "Existing public subnet IDs (required if enable_networking is false and enable_eks is true)"
  type        = list(string)
  default     = []
}

#Defines the existing node sg ID input value.
variable "existing_node_sg_id" {
  description = "Existing EKS node security group ID (required if enable_networking is false and enable_eks is true)"
  type        = string
  default     = ""
}

#Bootstrap Module Variables

variable "bootstrap_bucket_name" {
  description = "S3 bucket name for Terraform state (uses project-tfstate-bucket format)"
  type        = string
  default     = ""
}

#Defines the bootstrap create KMS input value.
variable "bootstrap_create_kms" {
  description = "Create KMS key for state encryption"
  type        = bool
  default     = true
}

#Defines the bootstrap KMS deletion window input value.
variable "bootstrap_kms_deletion_window" {
  description = "KMS key deletion window in days (7-30)"
  type        = number
  default     = 30
}

#Defines the bootstrap additional trusted arns input value.
variable "bootstrap_additional_trusted_arns" {
  description = "Additional IAM ARNs that can assume deployer role"
  type        = list(string)
  default     = []
}

#Defines the bootstrap require mfa input value.
variable "bootstrap_require_mfa" {
  description = "Require MFA to assume the human deployer role (CI uses the OIDC role and is unaffected)"
  type        = bool
  default     = true
}

#Defines the bootstrap external ID input value.
variable "bootstrap_external_id" {
  description = "External ID for cross-account access"
  type        = string
  default     = ""
}

#Defines the bootstrap max session duration input value.
variable "bootstrap_max_session_duration" {
  description = "Maximum session duration in seconds (3600-43200)"
  type        = number
  default     = 3600
}

#Defines the bootstrap additional policy arns input value.
variable "bootstrap_additional_policy_arns" {
  description = "Additional IAM policy ARNs for deployer role"
  type        = list(string)
  default     = []
}

#CodeArtifact package repository variables

variable "codeartifact_domain_name" {
  description = "CodeArtifact domain name for CloudOps client libraries. Empty defaults to <project_name>-<environment>."
  type        = string
  default     = ""
}

#Defines the codeartifact repository names input value.
variable "codeartifact_repository_names" {
  description = "CodeArtifact repository names to create for language package formats."
  type        = list(string)
  default     = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]
}

#Defines the codeartifact KMS key arn input value.
variable "codeartifact_kms_key_arn" {
  description = "Optional KMS key ARN for CodeArtifact domain encryption. Empty uses the AWS-managed key."
  type        = string
  default     = ""
}

#Database Module Variables

variable "database_instance_class" {
  description = "RDS instance class (e.g., db.t3.micro for dev, db.r6g.large for prod)"
  type        = string
  default     = "db.t3.micro"
}

#Defines the database allocated storage input value.
variable "database_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 20
}

#Defines the database max allocated storage input value.
variable "database_max_allocated_storage" {
  description = "Maximum storage for autoscaling (0 to disable)"
  type        = number
  default     = 100
}

#Defines the database engine input value.
variable "database_engine" {
  description = "Database engine (postgres, mysql, etc.)"
  type        = string
  default     = "postgres"
}

#Defines the database engine version input value.
variable "database_engine_version" {
  description = "Database engine version"
  type        = string
  default     = "15.5"
}

#Defines the database name input value.
variable "database_name" {
  description = "Initial database name to create"
  type        = string
  default     = "cloudops"
}

#Defines the database port input value.
variable "database_port" {
  description = "Database port"
  type        = number
  default     = 5432
}

#Defines the database multi az input value.
variable "database_multi_az" {
  description = "Enable Multi-AZ deployment for automatic failover"
  type        = bool
  default     = false
}

#Defines the database create read replica input value.
variable "database_create_read_replica" {
  description = "Create a read replica for DR/scaling"
  type        = bool
  default     = false
}

#Defines the database backup retention period input value.
variable "database_backup_retention_period" {
  description = "Number of days to retain automated backups (0-35)"
  type        = number
  default     = 7
}

#Defines the database deletion protection input value.
variable "database_deletion_protection" {
  description = "Enable deletion protection (recommended for production)"
  type        = bool
  default     = false
}

#Defines the database skip final snapshot input value.
variable "database_skip_final_snapshot" {
  description = "Skip final snapshot on deletion (set false for production)"
  type        = bool
  default     = true
}

#Defines the database performance insights enabled input value.
variable "database_performance_insights_enabled" {
  description = "Enable Performance Insights"
  type        = bool
  default     = true
}

#Defines the database monitoring interval input value.
variable "database_monitoring_interval" {
  description = "Enhanced monitoring interval in seconds (0, 1, 5, 10, 15, 30, 60)"
  type        = number
  default     = 60
}

#── Database logging policy (closes backlog #41) ─────────────────────────────
#Production should not log every DML payload. Recommended prod settings:
#database_log_statement                 = "ddl"
#database_log_duration                  = false
#database_log_min_duration_statement_ms = 500

variable "database_log_connections" {
  description = "RDS Postgres `log_connections`. Default true (dev/audit). Flip false in prod once perf monitoring is mature."
  type        = bool
  default     = true
}

#Defines the database log disconnections input value.
variable "database_log_disconnections" {
  description = "RDS Postgres `log_disconnections`."
  type        = bool
  default     = true
}

#Defines the database log duration input value.
variable "database_log_duration" {
  description = "RDS Postgres `log_duration` (logs duration of every completed statement). Prefer log_min_duration_statement_ms in prod."
  type        = bool
  default     = true
}

#Defines the database log statement input value.
variable "database_log_statement" {
  description = "RDS Postgres `log_statement`. `all` leaks customer payloads — use `ddl` or `none` in prod."
  type        = string
  default     = "all"

  validation {
    condition     = contains(["none", "ddl", "mod", "all"], var.database_log_statement)
    error_message = "database_log_statement must be one of: none, ddl, mod, all."
  }
}

#Defines the database log min duration statement ms input value.
variable "database_log_min_duration_statement_ms" {
  description = "Log statements slower than this many milliseconds. -1 = disabled. Production: 500–1000."
  type        = number
  default     = -1
}
