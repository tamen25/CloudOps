#Per-domain Customer-Managed Keys (CMKs).
#Created only when var.buckets_kms_cmk = true. AES-256 is the default fallback,
#which is fine for dev. CMKs unlock per-bucket key rotation, key policies, and
#CloudTrail KMS events for audit.
#
#One CMK per signal type so a key compromise scopes to one data domain.
#Decision recorded in docs/adr/023-observability-kms-signal-separation.md
#(closes backlog #110).

locals {
  cmk_count = var.buckets_kms_cmk ? 1 : 0
}

resource "aws_kms_key" "loki" {
  count = local.cmk_count

  description             = "Loki log storage encryption — ${var.name_prefix}/${var.environment}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = merge(local.common_tags, { Domain = "observability-loki" })
}

resource "aws_kms_alias" "loki" {
  count         = local.cmk_count
  name          = "alias/${var.name_prefix}-${var.environment}-loki"
  target_key_id = aws_kms_key.loki[0].id
}

resource "aws_kms_key" "tempo" {
  count = local.cmk_count

  description             = "Tempo trace storage encryption — ${var.name_prefix}/${var.environment}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = merge(local.common_tags, { Domain = "observability-tempo" })
}

resource "aws_kms_alias" "tempo" {
  count         = local.cmk_count
  name          = "alias/${var.name_prefix}-${var.environment}-tempo"
  target_key_id = aws_kms_key.tempo[0].id
}

resource "aws_kms_key" "mimir" {
  count = local.cmk_count

  description             = "Mimir TSDB block storage encryption — ${var.name_prefix}/${var.environment}"
  enable_key_rotation     = true
  deletion_window_in_days = 7
  tags                    = merge(local.common_tags, { Domain = "observability-mimir" })
}

resource "aws_kms_alias" "mimir" {
  count         = local.cmk_count
  name          = "alias/${var.name_prefix}-${var.environment}-mimir"
  target_key_id = aws_kms_key.mimir[0].id
}
