#This file defines remote state settings for CloudOps.
#Read foundation outputs (closes backlog #16). `STACK=cluster
#scripts/tf-init.sh` writes ignored backend.auto.tfvars values for the
#foundation state bucket/key. They can also be supplied explicitly via
#`foundation_state_bucket` + `foundation_state_key`.
#
#Disable by setting `use_remote_state_foundation = false` and supplying
#`existing_*` vars instead (one-shot bring-your-own-networking case).

data "terraform_remote_state" "foundation" {
  count = var.use_remote_state_foundation ? 1 : 0

  backend = "s3"

  config = {
    bucket = var.foundation_state_bucket
    key    = var.foundation_state_key
    region = var.region
  }
}

#Groups local values used by this Terraform file.
locals {
  foundation = var.use_remote_state_foundation ? data.terraform_remote_state.foundation[0].outputs : null

  permissions_boundary_arn = (
    var.use_remote_state_foundation
    ? try(local.foundation.permissions_boundary_arn, null)
    : var.permissions_boundary_arn
  )

  vpc_id = (
    var.use_remote_state_foundation
    ? local.foundation.vpc_id
    : var.existing_vpc_id
  )
  private_subnet_ids = (
    var.use_remote_state_foundation
    ? local.foundation.private_subnet_ids
    : var.existing_private_subnet_ids
  )
  public_subnet_ids = (
    var.use_remote_state_foundation
    ? local.foundation.public_subnet_ids
    : var.existing_public_subnet_ids
  )
  node_sg_id = (
    var.use_remote_state_foundation
    ? local.foundation.eks_nodes_sg_id
    : var.existing_node_sg_id
  )
  eks_cluster_name = (
    var.use_remote_state_foundation
    ? local.foundation.eks_cluster_name
    : "${var.project_name}-${var.environment}-cluster"
  )
  name_prefix = (
    var.use_remote_state_foundation
    ? local.foundation.name_prefix
    : var.project_name
  )
  database_secret_arn_pattern = "arn:aws:secretsmanager:${var.region}:${local.account_id}:secret:${local.name_prefix}-db-credentials-*"
}

#Reads the AWS caller identity data source named current.
data "aws_caller_identity" "current" {}

#Groups local values used by this Terraform file.
locals {
  account_id = var.aws_account_id != "" ? var.aws_account_id : data.aws_caller_identity.current.account_id
}
