#Publisher policy attached to the order-api IRSA role. Strict resource
#scoping to this stream's ARN.

data "aws_iam_policy_document" "publish" {
  statement {
    effect = "Allow"
    actions = [
      "kinesis:PutRecord",
      "kinesis:PutRecords",
      "kinesis:DescribeStream",
      "kinesis:DescribeStreamSummary",
    ]
    resources = [aws_kinesis_stream.orders.arn]
  }

  dynamic "statement" {
    for_each = var.kms_key_arn != "" ? [1] : []
    content {
      effect    = "Allow"
      actions   = ["kms:GenerateDataKey"]
      resources = [var.kms_key_arn]
    }
  }
}

resource "aws_iam_role_policy" "publish" {
  name   = "${local.name_prefix}-orders-events-publish"
  role   = var.order_api_irsa_role_name
  policy = data.aws_iam_policy_document.publish.json
}
