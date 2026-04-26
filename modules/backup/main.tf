# AWS Backup vault + plan + selection.
# CRITICAL: vault_lock_enabled=true makes the vault undeletable until
# min_retention_days expires. Use ONLY in real prod.

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.50" }
  }
}

locals {
  name = var.name_prefix
}

# ── Vault ────────────────────────────────────────────────────────────────────

resource "aws_backup_vault" "main" {
  name        = "${local.name}-vault"
  kms_key_arn = var.kms_key_arn != "" ? var.kms_key_arn : null

  tags = merge(var.tags, { Name = "${local.name}-vault" })
}

resource "aws_backup_vault_lock_configuration" "main" {
  count = var.vault_lock_enabled ? 1 : 0

  backup_vault_name   = aws_backup_vault.main.name
  changeable_for_days = 3
  min_retention_days  = var.vault_lock_min_retention_days
  max_retention_days  = var.vault_lock_max_retention_days
}

# ── Plan ─────────────────────────────────────────────────────────────────────

resource "aws_backup_plan" "main" {
  name = "${local.name}-plan"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 ? * * *)"  # 05:00 UTC daily

    lifecycle {
      delete_after = var.daily_retention_days
    }
  }

  rule {
    rule_name         = "weekly"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 ? * SUN *)"  # Sunday 05:00 UTC

    lifecycle {
      delete_after = var.weekly_retention_days
    }
  }

  rule {
    rule_name         = "monthly"
    target_vault_name = aws_backup_vault.main.name
    schedule          = "cron(0 5 1 * ? *)"  # 1st of each month, 05:00 UTC

    lifecycle {
      delete_after = var.monthly_retention_days
    }
  }

  tags = var.tags
}

# ── IAM service role ─────────────────────────────────────────────────────────

resource "aws_iam_role" "backup" {
  name = "${local.name}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRole"
      Principal = { Service = "backup.amazonaws.com" }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

# ── Selection ────────────────────────────────────────────────────────────────

resource "aws_backup_selection" "rds" {
  count = length(var.rds_instance_arns) > 0 ? 1 : 0

  iam_role_arn = aws_iam_role.backup.arn
  name         = "${local.name}-rds-selection"
  plan_id      = aws_backup_plan.main.id
  resources    = var.rds_instance_arns
}

resource "aws_backup_selection" "ebs_tagged" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${local.name}-ebs-tagged-selection"
  plan_id      = aws_backup_plan.main.id

  selection_tag {
    type  = "STRINGEQUALS"
    key   = var.ebs_volume_tag_key
    value = var.ebs_volume_tag_value
  }
}
