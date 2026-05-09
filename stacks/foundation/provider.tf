#This file defines provider settings for CloudOps.
terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  #Partial S3 backend. Bucket + key set at init time by scripts/tf-init.sh
  #(STACK=foundation → key = `<env>/foundation/terraform.tfstate`).
  backend "s3" {
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}

#Configures the AWS provider.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      Stack       = "foundation"
      ManagedBy   = "Terraform"
    }
  }
}
