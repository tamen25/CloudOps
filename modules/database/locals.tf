terraform {
  required_version = ">= 1.11.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

locals {
  common_tags = merge(
    var.tags,
    {
      Module      = "database"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  )

  final_snapshot_id = var.final_snapshot_identifier != null ? var.final_snapshot_identifier : "${var.name_prefix}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"
}
