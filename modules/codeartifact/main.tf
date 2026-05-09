#This file defines main settings for CloudOps.
locals {
  repositories = toset(var.repository_names)
}

#Creates the AWS codeartifact domain resource named this.
resource "aws_codeartifact_domain" "this" {
  domain         = var.domain_name
  encryption_key = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = merge(var.tags, {
    Name      = var.domain_name
    Component = "codeartifact"
  })
}

#Creates the AWS codeartifact repository resource named this.
resource "aws_codeartifact_repository" "this" {
  for_each = local.repositories

  repository  = each.key
  domain      = aws_codeartifact_domain.this.domain
  description = "CloudOps internal package repository: ${each.key}"

  tags = merge(var.tags, {
    Name      = each.key
    Component = "codeartifact"
  })
}
