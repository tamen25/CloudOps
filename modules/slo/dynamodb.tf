#DynamoDB table for SLO error budget historical snapshots
#
#Schema:
#PK  slo_name  (String) — e.g. "order-api-availability"
#SK  timestamp (String) — ISO 8601, e.g. "2024-01-15T10:30:00.000Z"
#ttl           (Number) — epoch seconds; items auto-expire after 90 days

resource "aws_dynamodb_table" "error_budgets" {
  #checkov:skip=CKV_AWS_119:AWS managed encryption is acceptable - CMK adds cost without meaningful security benefit for dev
  name         = "${var.project_name}-error-budgets"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "slo_name"
  range_key    = "timestamp"

  attribute {
    name = "slo_name"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, { Name = "${var.project_name}-error-budgets" })
}
