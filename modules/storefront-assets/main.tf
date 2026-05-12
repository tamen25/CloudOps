terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  bucket_name = "${local.name_prefix}-assets"
  asset_host  = var.create_custom_domain ? "${var.assets_subdomain}.${var.domain_name}" : ""
}
