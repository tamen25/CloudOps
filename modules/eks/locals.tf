locals {
  name = "${var.name_prefix}-${var.environment}"

  #IRSA trust policies require the issuer URL without the https:// scheme
  oidc_issuer = trimprefix(aws_iam_openid_connect_provider.main.url, "https://")

  #Backlog #111 — gate secrets encryption by environment. Explicit override wins;
  #otherwise auto-enable for staging/prod and skip for dev to keep teardown cheap.
  secrets_encryption_enabled = (
    var.enable_secrets_encryption == null
    ? contains(["staging", "prod"], var.environment)
    : var.enable_secrets_encryption
  )

  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Module      = "eks"
    }
  )
}
