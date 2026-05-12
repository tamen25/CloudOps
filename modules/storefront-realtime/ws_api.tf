resource "aws_apigatewayv2_api" "ws" {
  name                       = local.api_name
  protocol_type              = "WEBSOCKET"
  route_selection_expression = "$request.body.action"
  tags                       = var.tags
}

#─── Lambdas (zipped from local sources, deps pre-installed) ───────────────
data "archive_file" "connect" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/connect"
  output_path = "${path.module}/.build/ws-connect.zip"
  excludes    = ["node_modules/.package-lock.json"]
}
data "archive_file" "disconnect" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/disconnect"
  output_path = "${path.module}/.build/ws-disconnect.zip"
  excludes    = ["node_modules/.package-lock.json"]
}
data "archive_file" "fanout" {
  type        = "zip"
  source_dir  = "${path.module}/lambdas/fanout"
  output_path = "${path.module}/.build/ws-fanout.zip"
  excludes    = ["node_modules/.package-lock.json"]
}

resource "aws_lambda_function" "connect" {
  function_name = "${local.name_prefix}-ws-connect"
  role          = aws_iam_role.connect.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  filename      = data.archive_file.connect.output_path
  source_code_hash = data.archive_file.connect.output_base64sha256
  timeout       = 5
  memory_size   = 256
  environment {
    variables = {
      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.connections.name
      COGNITO_ISSUER_URL     = var.cognito_issuer_url
      COGNITO_CLIENT_ID      = var.cognito_client_id
      COGNITO_JWKS_URL       = "${var.cognito_issuer_url}/.well-known/jwks.json"
    }
  }
  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambdas/connect/node_modules/.package-lock.json") || fileexists("${path.module}/lambdas/connect/package.json")
      error_message = "ws-connect deps missing. Run scripts/build-lambdas.sh."
    }
  }
  tags = var.tags
}

resource "aws_lambda_function" "disconnect" {
  function_name = "${local.name_prefix}-ws-disconnect"
  role          = aws_iam_role.disconnect.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  filename      = data.archive_file.disconnect.output_path
  source_code_hash = data.archive_file.disconnect.output_base64sha256
  timeout       = 5
  memory_size   = 256
  environment {
    variables = {
      CONNECTIONS_TABLE_NAME = aws_dynamodb_table.connections.name
    }
  }
  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambdas/disconnect/node_modules/.package-lock.json") || fileexists("${path.module}/lambdas/disconnect/package.json")
      error_message = "ws-disconnect deps missing. Run scripts/build-lambdas.sh."
    }
  }
  tags = var.tags
}

resource "aws_lambda_function" "fanout" {
  function_name = "${local.name_prefix}-ws-fanout"
  role          = aws_iam_role.fanout.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  filename      = data.archive_file.fanout.output_path
  source_code_hash = data.archive_file.fanout.output_base64sha256
  timeout       = 30
  memory_size   = 512
  environment {
    variables = {
      CONNECTIONS_TABLE_NAME    = aws_dynamodb_table.connections.name
      WS_MANAGEMENT_ENDPOINT    = "https://${aws_apigatewayv2_api.ws.id}.execute-api.${var.region}.amazonaws.com/${aws_apigatewayv2_stage.default.name}"
    }
  }
  dynamic "dead_letter_config" {
    for_each = var.fanout_dlq_arn != "" ? [1] : []
    content {
      target_arn = var.fanout_dlq_arn
    }
  }
  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambdas/fanout/node_modules/.package-lock.json") || fileexists("${path.module}/lambdas/fanout/package.json")
      error_message = "ws-fanout deps missing. Run scripts/build-lambdas.sh."
    }
  }
  tags = var.tags
}

#─── Routes + integrations ─────────────────────────────────────────────────
resource "aws_apigatewayv2_integration" "connect" {
  api_id                    = aws_apigatewayv2_api.ws.id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.connect.invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_apigatewayv2_integration" "disconnect" {
  api_id                    = aws_apigatewayv2_api.ws.id
  integration_type          = "AWS_PROXY"
  integration_uri           = aws_lambda_function.disconnect.invoke_arn
  content_handling_strategy = "CONVERT_TO_TEXT"
  passthrough_behavior      = "WHEN_NO_MATCH"
}

resource "aws_apigatewayv2_route" "connect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$connect"
  target    = "integrations/${aws_apigatewayv2_integration.connect.id}"
}
resource "aws_apigatewayv2_route" "disconnect" {
  api_id    = aws_apigatewayv2_api.ws.id
  route_key = "$disconnect"
  target    = "integrations/${aws_apigatewayv2_integration.disconnect.id}"
}

resource "aws_lambda_permission" "connect_apigw" {
  statement_id  = "AllowWSConnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.connect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}
resource "aws_lambda_permission" "disconnect_apigw" {
  statement_id  = "AllowWSDisconnect"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.disconnect.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ws.execution_arn}/*/*"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.ws.id
  name        = "prod"
  auto_deploy = true
}

resource "aws_apigatewayv2_deployment" "ws" {
  api_id      = aws_apigatewayv2_api.ws.id
  description = "ws deployment"

  triggers = {
    redeploy = sha1(jsonencode([
      aws_apigatewayv2_route.connect.id,
      aws_apigatewayv2_route.disconnect.id,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }

  depends_on = [
    aws_apigatewayv2_route.connect,
    aws_apigatewayv2_route.disconnect,
  ]
}

#─── Kinesis -> fanout event source mapping ────────────────────────────────
resource "aws_lambda_event_source_mapping" "kinesis_to_fanout" {
  event_source_arn                   = var.kinesis_stream_arn
  function_name                      = aws_lambda_function.fanout.function_name
  starting_position                  = "LATEST"
  batch_size                         = 100
  maximum_batching_window_in_seconds = 1
  parallelization_factor             = 2
  bisect_batch_on_function_error     = true
  maximum_retry_attempts             = 3
}

#─── Custom domain (optional) ──────────────────────────────────────────────
resource "aws_apigatewayv2_domain_name" "ws" {
  count       = var.create_custom_domain ? 1 : 0
  domain_name = "${var.ws_subdomain}.${var.domain_name}"

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "ws" {
  count       = var.create_custom_domain ? 1 : 0
  api_id      = aws_apigatewayv2_api.ws.id
  domain_name = aws_apigatewayv2_domain_name.ws[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "ws" {
  count   = var.create_custom_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = "${var.ws_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.ws[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
