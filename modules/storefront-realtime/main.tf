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
  name_prefix     = "${var.project_name}-${var.environment}"
  connections_table = "${local.name_prefix}-ws-connections"
  api_name        = "${local.name_prefix}-ws"
}
