#This file defines dynamodb settings for CloudOps.
#FinOps Module — DynamoDB cost history table
#
#Stores daily per-service cost snapshots ingested from Cost Explorer.
#PK: service (String) — AWS service name (e.g., "Amazon EC2")
#SK: date   (String) — ISO date YYYY-MM-DD
#GSI date-cost-index allows querying most expensive days across all services.

resource "aws_dynamodb_table" "cost_data" {
  #checkov:skip=CKV_AWS_119:AWS managed encryption is acceptable - CMK adds cost without meaningful security benefit for dev
  name         = "${var.project_name}-cost-data"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "service"
  range_key    = "date"

  attribute {
    name = "service"
    type = "S"
  }

  attribute {
    name = "date"
    type = "S"
  }

  attribute {
    name = "daily_cost"
    type = "N"
  }

  global_secondary_index {
    name            = "date-cost-index"
    hash_key        = "date"
    range_key       = "daily_cost"
    projection_type = "ALL"
  }

  #Auto-expire records after 365 days
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = var.tags
}
