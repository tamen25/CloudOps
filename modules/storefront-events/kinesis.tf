#orders-events Kinesis Data Stream. ON_DEMAND mode = no shard mgmt;
#scales automatically with traffic, cheap when idle.

resource "aws_kinesis_stream" "orders" {
  name             = local.stream_name
  retention_period = var.retention_hours

  stream_mode_details {
    stream_mode = "ON_DEMAND"
  }

  encryption_type = "KMS"
  kms_key_id      = var.kms_key_arn != "" ? var.kms_key_arn : "alias/aws/kinesis"

  shard_level_metrics = [
    "IncomingBytes",
    "OutgoingBytes",
    "IncomingRecords",
    "OutgoingRecords",
  ]

  tags = merge(var.tags, {
    Component = "storefront-events"
  })
}
