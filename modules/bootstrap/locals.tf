#Retrieves the AWS account ID and ARN for the current AWS account
data "aws_caller_identity" "current" {}

#References the existing S3 bucket used for Terraform state storage
data "aws_s3_bucket" "terraform_state" {
  bucket = local.bucket_name
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    Owner       = var.owner
    ManagedBy   = "Terraform"
  }

  deployer_role_name = "${var.project_name}-deployer"
  bucket_name        = var.bucket_name != "" ? var.bucket_name : "${var.project_name}-tfstate-bucket"
}
