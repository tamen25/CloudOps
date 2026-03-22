data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  name = "${var.name_prefix}-${var.environment}"

  # IRSA trust policies require the issuer URL without the https:// scheme
  oidc_issuer = trimprefix(aws_iam_openid_connect_provider.main.url, "https://")

  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Module      = "eks"
    }
  )
}
