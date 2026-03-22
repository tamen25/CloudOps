# Get current AWS region
data "aws_region" "current" {}

locals {
  # Resource naming convention
  name = "${var.name_prefix}-${var.environment}"

  # Merge user tags with module defaults
  common_tags = merge(
    {
      Environment = var.environment
      ManagedBy   = "Terraform"
      Module      = "compute"
    },
    var.tags
  )
}
