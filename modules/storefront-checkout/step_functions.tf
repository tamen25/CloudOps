#Post-order workflow. The authenticated storefront route creates the order
#before starting this state machine so end-user writes never depend on an
#anonymous X-Tenant-Id path. This workflow keeps durable email dispatch.

resource "aws_cloudwatch_log_group" "sfn" {
  name              = "/aws/states/${local.state_machine}"
  retention_in_days = 14
  tags              = var.tags
}

resource "aws_sfn_state_machine" "checkout" {
  name     = local.state_machine
  role_arn = aws_iam_role.sfn.arn
  type     = "STANDARD"

  definition = jsonencode({
    Comment = "Post-order workflow: enqueue confirmation email."
    StartAt = "EnqueueEmail"
    States = {
      EnqueueEmail = {
        Type     = "Task"
        Resource = "arn:aws:states:::sqs:sendMessage"
        Parameters = {
          QueueUrl = aws_sqs_queue.email.url
          MessageBody = {
            "order_id.$"  = "$.order_id"
            "tenant_id.$" = "$.tenant_id"
            "total.$"     = "$.total"
            "items.$"     = "$.items"
            "to.$"        = "$.email"
          }
        }
        End = true
      }
    }
  })

  logging_configuration {
    log_destination = "${aws_cloudwatch_log_group.sfn.arn}:*"
    # The execution payload contains the shopper's email address. Preserve
    # error visibility without copying personal data into CloudWatch logs.
    include_execution_data = false
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }

  tags = var.tags
}

#â”€â”€â”€ Email Lambda â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
data "archive_file" "email" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/email"
  output_path = "${path.module}/.build/order-email.zip"
  excludes    = ["node_modules/.package-lock.json"]
}

resource "aws_lambda_function" "email" {
  function_name    = local.email_function
  role             = aws_iam_role.email.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  filename         = data.archive_file.email.output_path
  source_code_hash = data.archive_file.email.output_base64sha256
  timeout          = 15
  memory_size      = 256
  environment {
    variables = {
      SES_SOURCE_EMAIL = var.ses_source_email
    }
  }
  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambdas/email/node_modules/.package-lock.json") || fileexists("${path.module}/lambdas/email/package.json")
      error_message = "order-email Lambda deps missing. Run scripts/build-lambdas.sh."
    }
  }
  tags = var.tags
}

resource "aws_lambda_event_source_mapping" "email_sqs" {
  event_source_arn = aws_sqs_queue.email.arn
  function_name    = aws_lambda_function.email.function_name
  batch_size       = 5
  enabled          = true
}
