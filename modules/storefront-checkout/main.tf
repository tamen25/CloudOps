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
  name_prefix    = "${var.project_name}-${var.environment}"
  state_machine  = "${local.name_prefix}-checkout"
  email_queue    = "${local.name_prefix}-order-email"
  email_function = "${local.name_prefix}-order-email"
}
