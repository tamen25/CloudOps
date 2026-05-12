resource "aws_sqs_queue" "email_dlq" {
  name                      = "${local.email_queue}-dlq"
  message_retention_seconds = 14 * 24 * 60 * 60
  tags                      = var.tags
}

resource "aws_sqs_queue" "email" {
  name                       = local.email_queue
  visibility_timeout_seconds = 30
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 3
  })
  tags = var.tags
}
