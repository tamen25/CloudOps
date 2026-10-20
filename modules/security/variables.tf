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

#── Compliance scanner inputs ─────────────────────────────────────────────────

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

#── Auto-remediation inputs ───────────────────────────────────────────────────

variable "github_token_secret_arn" {
  description = "Secrets Manager ARN containing a GitHub personal access token with repo scope — used by the auto-remediation Lambda to create issues"
  type        = string
  default     = ""
}

variable "github_repo" {
  description = "GitHub repository in owner/name format where security issues are created. Empty = skip issue creation."
  type        = string
  default     = ""
}

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

variable "enable_image_signature_constraint" {
  description = "Activate the K8sRequireImageSignature Gatekeeper constraint. Requires enable_cosign_provider=true (or an out-of-band provider deployment)."
  type        = bool
  default     = false
}

variable "enable_external_secrets" {
  description = "Install External Secrets Operator (pulls AWS Secrets Manager values into k8s Secrets via IRSA). Provisions a default ClusterSecretStore."
  type        = bool
  default     = false
}

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

variable "chaos_mesh_namespace" {
  description = "Namespace of the Chaos Mesh install, exempted from the cluster-wide no-root and no-privileged constraints; empty when Chaos Mesh is not installed"
  type        = string
  default     = ""
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for every role this module creates (bootstrap output; null for none)"
  type        = string
  default     = null
}
