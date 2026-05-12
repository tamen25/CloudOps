#Checkout saga state machine. CreateOrder calls Express POST /order with
#the SF execution name as Idempotency-Key so retries hit #72's path.
#EnqueueEmail drops a message on SQS; the email Lambda renders and sends.
#On any failure the Compensate state writes a final message; full inventory
#reservation would attach here when products carry per-tenant stock count.

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
    Comment = "Checkout saga: reserve → create order → enqueue email."
    StartAt = "CreateOrder"
    States = {
      CreateOrder = {
        Type     = "Task"
        Resource = "arn:aws:states:::http:invoke"
        Parameters = {
          ApiEndpoint = "${var.order_api_url}/order"
          Method      = "POST"
          Authentication = {
            ConnectionArn = ""
          }
          Headers = {
            "Content-Type"    = "application/json"
            "X-Tenant-Id.$"   = "$.tenant_id"
            "Idempotency-Key.$" = "$$.Execution.Name"
          }
          RequestBody = {
            "items.$" = "$.items"
            "total.$" = "$.total"
          }
        }
        ResultPath = "$.order"
        Catch = [
          {
            ErrorEquals = ["States.ALL"]
            ResultPath  = "$.error"
            Next        = "Failed"
          },
        ]
        Next = "EnqueueEmail"
      }
      EnqueueEmail = {
        Type     = "Task"
        Resource = "arn:aws:states:::sqs:sendMessage"
        Parameters = {
          QueueUrl = aws_sqs_queue.email.url
          MessageBody = {
            "order_id.$" = "$.order.ResponseBody.order.order_id"
            "tenant_id.$" = "$.tenant_id"
            "total.$" = "$.total"
            "items.$" = "$.items"
            "to.$" = "$.email"
          }
        }
        End = true
      }
      Failed = {
        Type = "Fail"
        Cause = "checkout_failed"
        Error = "CheckoutSagaFailed"
      }
    }
  })

  logging_configuration {
    log_destination        = "${aws_cloudwatch_log_group.sfn.arn}:*"
    include_execution_data = true
    level                  = "ERROR"
  }

  tracing_configuration {
    enabled = true
  }

  tags = var.tags
}

#─── Email Lambda ──────────────────────────────────────────────────────────
data "archive_file" "email" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/email"
  output_path = "${path.module}/.build/order-email.zip"
  excludes    = ["node_modules/.package-lock.json"]
}

resource "aws_lambda_function" "email" {
  function_name = local.email_function
  role          = aws_iam_role.email.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  filename      = data.archive_file.email.output_path
  source_code_hash = data.archive_file.email.output_base64sha256
  timeout       = 15
  memory_size   = 256
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
