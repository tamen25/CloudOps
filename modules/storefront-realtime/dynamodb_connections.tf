resource "aws_dynamodb_table" "connections" {
  name         = local.connections_table
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "connId"

  attribute {
    name = "connId"
    type = "S"
  }

  attribute {
    name = "tenantId"
    type = "S"
  }

  global_secondary_index {
    name            = "by-tenant"
    hash_key        = "tenantId"
    range_key       = "connId"
    projection_type = "ALL"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  tags = merge(var.tags, {
    Component = "storefront-realtime"
  })
}
