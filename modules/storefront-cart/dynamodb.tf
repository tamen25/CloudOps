#cloudops-cart-<env> Dynamo table — on-demand, KMS-encrypted via AWS-managed
#aws/dynamodb key by default. Keys:
#  pk  S  "TENANT#<tenant>#USER#<sub>"  or  "GUEST#<anonId>"
#  sk  S  "ITEM#<sku>"
#TTL attribute `expires_at` purges abandoned carts after 7 days.

resource "aws_dynamodb_table" "cart" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  deletion_protection_enabled = var.environment == "prod"

  tags = merge(var.tags, {
    Component = "storefront-cart"
  })
}
