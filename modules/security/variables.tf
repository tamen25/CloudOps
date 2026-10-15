#This file defines variables settings for CloudOps.
variable "eks_cluster_name" {
  description = "EKS cluster name — used for tagging and resource naming"
  type        = string
}

#Defines the OTel API key input value.
variable "otel_api_key" {
  description = "OTel Collector bearer token — passed from the observability module to configure Falcosidekick"
  type        = string
  sensitive   = true
  default     = ""
}

#Defines the environment input value.
variable "environment" {
  description = "Deployment environment (dev, staging, prod)"
  type        = string
}

#Defines the project name input value.
variable "project_name" {
  description = "Project name used for resource naming and tagging"
  type        = string
}

#Defines the AWS account ID input value.
variable "aws_account_id" {
  description = "AWS account ID — used to construct the ECR registry URL for the K8sAllowedRepos policy"
  type        = string
}

#Defines the region input value.
variable "region" {
  description = "AWS region — used to construct the ECR registry URL for the K8sAllowedRepos policy"
  type        = string
}

#Defines the database subnet cidrs input value.
variable "db_subnet_cidrs" {
  description = "List of DB subnet CIDR blocks — used to allow order-api egress to RDS on port 5432. Pass empty list to skip the RDS egress rule."
  type        = list(string)
  default     = []
}

#Defines the VPC cidr input value.
variable "vpc_cidr" {
  description = "VPC CIDR block — used to allow order-api egress to AWS VPC endpoints (Secrets Manager, ECR) on port 443"
  type        = string
  default     = "10.0.0.0/16"
}

#── Compliance scanner inputs ─────────────────────────────────────────────────

variable "vpc_id" {
  description = "VPC ID passed to the compliance scanner Lambda for security group checks"
  type        = string
  default     = ""
}

#Defines the RDS instance ID input value.
variable "rds_instance_id" {
  description = "RDS instance identifier for RDS compliance checks. Leave empty to skip RDS checks."
  type        = string
  default     = ""
}

#Defines the state bucket name input value.
variable "state_bucket_name" {
  description = "Terraform state S3 bucket name — scanned for public access block, SSE, and versioning"
  type        = string
  default     = ""
}

#Defines the loki bucket name input value.
variable "loki_bucket_name" {
  description = "Loki observability S3 bucket name — scanned for public access block and SSE. Leave empty to skip."
  type        = string
  default     = ""
}

#Defines the tempo bucket name input value.
variable "tempo_bucket_name" {
  description = "Tempo observability S3 bucket name — scanned for public access block and SSE. Leave empty to skip."
  type        = string
  default     = ""
}

#Defines the security alert email input value.
variable "security_alert_email" {
  description = "Email address for SNS security alert subscriptions — receives all severity findings. Leave empty to skip subscription."
  type        = string
  default     = ""
}

#Defines the security critical email input value.
variable "security_critical_email" {
  description = "Email address for HIGH/CRITICAL-only SNS alerts (pager / on-call inbox). Leave empty to skip subscription."
  type        = string
  default     = ""
}

#── Auto-remediation inputs ───────────────────────────────────────────────────

variable "github_token_secret_arn" {
  description = "Secrets Manager ARN containing a GitHub personal access token with repo scope — used by the auto-remediation Lambda to create issues"
  type        = string
  default     = ""
}

#Defines the github repo input value.
variable "github_repo" {
  description = "GitHub repository in owner/name format where security issues are created. Empty = skip issue creation."
  type        = string
  default     = ""
}

#Defines the application namespace input value.
variable "application_namespace" {
  description = "Kubernetes namespace where the managed application runs — Gatekeeper policies scope to this namespace"
  type        = string
  default     = "cloudops"
}

#Backlog #56 — image-signature admission gate. The Rego policy calls a
#Gatekeeper external_data provider named `cosign-provider`; that provider
#must be deployed in `gatekeeper-system` for the constraint to function.
#Default OFF: with no provider deployed, the constraint reports system
#errors on every admission and blocks the cluster. Set to true only after
#`enable_cosign_provider = true` (or when the provider is deployed
#out-of-band) so the constraint has something to call.
variable "enable_cosign_provider" {
  description = "Deploy the sigstore Cosign Gatekeeper provider sidecar so the K8sRequireImageSignature constraint can verify signatures."
  type        = bool
  default     = false
}

#Defines the enable image signature constraint input value.
variable "enable_image_signature_constraint" {
  description = "Activate the K8sRequireImageSignature Gatekeeper constraint. Requires enable_cosign_provider=true (or an out-of-band provider deployment)."
  type        = bool
  default     = false
}

#Defines the enable external secrets input value.
variable "enable_external_secrets" {
  description = "Install External Secrets Operator (pulls AWS Secrets Manager values into k8s Secrets via IRSA). Provisions a default ClusterSecretStore."
  type        = bool
  default     = false
}

#Defines the external secrets allowed arns input value.
variable "external_secrets_allowed_arns" {
  description = "Secrets Manager ARNs (or ARN wildcards) the External Secrets Operator IRSA may read. Empty list falls back to `Resource = \"*\"` — use only for initial bootstrap. Closes backlog #22."
  type        = list(string)
  default     = []
}

#── kube-bench IRSA inputs ────────────────────────────────────────────────────

variable "oidc_provider_arn" {
  description = "OIDC provider ARN for the EKS cluster — required for IRSA on the kube-bench ServiceAccount"
  type        = string
  default     = ""
}

#Defines the OIDC provider URL input value.
variable "oidc_provider_url" {
  description = "OIDC provider URL without https:// prefix (e.g. oidc.eks.us-east-1.amazonaws.com/id/XXXX) — required for IRSA trust policy"
  type        = string
  default     = ""
}

#Defines the tags input value.
variable "tags" {
  description = "Common resource tags to apply to AWS resources"
  type        = map(string)
  default     = {}
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}
