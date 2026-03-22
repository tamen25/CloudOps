data "aws_region" "current" {}

locals {
  name = "${var.name_prefix}-${var.environment}"

  common_tags = merge(
    var.tags,
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Module      = "ingress"
    }
  )
}
