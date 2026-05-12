#search-gateway Lambda. Verifies the Cognito JWT (claims surfaced by the
#API GW JWT authorizer), resolves tenant_id from custom:tenant_id, signs
#an HMAC request to Express _internal/search, and caches the response
#in a per-Lambda LRU map (warm-only 60s TTL).

data "archive_file" "search_gateway" {
  type        = "zip"
  source_dir  = "${path.module}/lambda_function"
  output_path = "${path.module}/.build/search-gateway.zip"
  excludes    = ["node_modules/.package-lock.json"]
}

resource "aws_security_group" "lambda" {
  name        = "${local.name_prefix}-search-gateway-lambda"
  description = "search-gateway Lambda ENIs"
  vpc_id      = data.aws_subnet.first.vpc_id

  egress {
    description = "Egress to anywhere - Lambda calls Express via internal NLB plus AWS APIs."
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

data "aws_subnet" "first" {
  id = var.private_subnet_ids[0]
}

resource "aws_lambda_function" "search_gateway" {
  function_name = "${local.name_prefix}-search-gateway"
  role          = aws_iam_role.search_gateway.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
  architectures = ["arm64"]
  memory_size   = var.lambda_memory_mb
  timeout       = var.lambda_timeout_seconds

  filename         = data.archive_file.search_gateway.output_path
  source_code_hash = data.archive_file.search_gateway.output_base64sha256

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = concat([aws_security_group.lambda.id], var.vpc_link_security_group_ids)
  }

  tracing_config {
    mode = "Active"
  }

  environment {
    variables = {
      ORDER_API_INTERNAL_URL     = var.order_api_internal_url
      HMAC_SECRET_PARAMETER_NAME = var.hmac_secret_parameter_name
      OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint
      OTEL_SERVICE_NAME          = "search-gateway"
      SERVICE_ENV                = var.environment
    }
  }

  tags = var.tags

  lifecycle {
    precondition {
      condition     = fileexists("${path.module}/lambda_function/node_modules/.package-lock.json") || fileexists("${path.module}/lambda_function/package.json")
      error_message = "search-gateway Lambda deps not installed. Run scripts/build-lambdas.sh before terraform apply."
    }
  }
}

resource "aws_cloudwatch_log_group" "search_gateway" {
  name              = "/aws/lambda/${aws_lambda_function.search_gateway.function_name}"
  retention_in_days = 14
  tags              = var.tags
}
