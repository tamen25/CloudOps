variable "eks_cluster_name" {
  description = "EKS cluster name — used for tagging and resource naming"
  type        = string
}

variable "otel_api_key" {
  description = "OTel Collector bearer token — passed from the observability module to configure Falcosidekick"
  type        = string
  sensitive   = true
  default     = ""
}

variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

variable "aws_account_id" {
  description = "AWS account ID — used to construct the ECR registry URL for the K8sAllowedRepos policy"
  type        = string
}

variable "region" {
  description = "AWS region — used to construct the ECR registry URL for the K8sAllowedRepos policy"
  type        = string
}

variable "db_subnet_cidrs" {
  description = "List of DB subnet CIDR blocks — used to allow order-api egress to RDS on port 5432. Pass empty list to skip the RDS egress rule."
  type        = list(string)
  default     = []
}

variable "vpc_cidr" {
  description = "VPC CIDR block — used to allow order-api egress to AWS VPC endpoints (Secrets Manager, ECR) on port 443"
  type        = string
  default     = "10.0.0.0/16"
}

# ── Compliance scanner inputs ─────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID passed to the compliance scanner Lambda for security group checks"
  type        = string
  default     = ""
}

variable "rds_instance_id" {
  description = "RDS instance identifier for RDS compliance checks. Leave empty to skip RDS checks."
  type        = string
  default     = ""
}

variable "state_bucket_name" {
  description = "Terraform state S3 bucket name — scanned for public access block, SSE, and versioning"
  type        = string
  default     = ""
}

variable "loki_bucket_name" {
  description = "Loki observability S3 bucket name — scanned for public access block and SSE. Leave empty to skip."
  type        = string
  default     = ""
}

variable "tempo_bucket_name" {
  description = "Tempo observability S3 bucket name — scanned for public access block and SSE. Leave empty to skip."
  type        = string
  default     = ""
}

variable "security_alert_email" {
  description = "Email address for SNS security alert subscriptions — receives all severity findings. Leave empty to skip subscription."
  type        = string
  default     = ""
}

variable "security_critical_email" {
  description = "Email address for HIGH/CRITICAL-only SNS alerts (pager / on-call inbox). Leave empty to skip subscription."
  type        = string
  default     = ""
}

# ── Auto-remediation inputs ───────────────────────────────────────────────────

variable "github_token_secret_arn" {
  description = "Secrets Manager ARN containing a GitHub personal access token with repo scope — used by the auto-remediation Lambda to create issues"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository in owner/name format where security issues are created"
  type        = string
  default     = "tamen25/CloudOps"
}

# ── kube-bench IRSA inputs ────────────────────────────────────────────────────

variable "oidc_provider_arn" {
  description = "OIDC provider ARN for the EKS cluster — required for IRSA on the kube-bench ServiceAccount"
  type        = string
  default     = ""
}

variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// prefix (e.g. oidc.eks.us-east-1.amazonaws.com/id/XXXX) — required for IRSA trust policy"
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common resource tags to apply to AWS resources"
  type        = map(string)
  default     = {}
}
