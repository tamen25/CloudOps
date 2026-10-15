#Security findings table
#Stores compliance scanner findings with deduplication, TTL, and audit history.

resource "aws_dynamodb_table" "security_findings" {
  #checkov:skip=CKV_AWS_119:AWS managed encryption is acceptable - CMK adds cost without meaningful security benefit for dev
  name         = "cloudops-security-findings"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "finding_id"
  range_key    = "timestamp"

  attribute {
    name = "finding_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }

  attribute {
    name = "severity"
    type = "S"
  }

  attribute {
    name = "status"
    type = "S"
  }

  #Query by severity + time range — e.g. all CRITICAL findings this week
  global_secondary_index {
    name            = "severity-timestamp-index"
    hash_key        = "severity"
    range_key       = "timestamp"
    projection_type = "ALL"
  }

  #Query all OPEN findings for deduplication on each scan run
  global_secondary_index {
    name            = "status-index"
    hash_key        = "status"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = merge(var.tags, {
    Name      = "cloudops-security-findings"
    Component = "security"
  })
}
