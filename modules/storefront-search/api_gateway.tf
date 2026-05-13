#API Gateway HTTP API at search.<domain_name>. JWT authorizer points at the
#storefront Cognito User Pool. Lambda is the integration target — VPC link
#is only needed if we ever switch to an HTTP_PROXY integration pointing
#straight at the in-VPC NLB. For now the Lambda makes the in-VPC call so
#its warm cache + HMAC signing stay inside the trust boundary.

resource "aws_apigatewayv2_api" "search" {
  name          = "${local.name_prefix}-search"
  protocol_type = "HTTP"

  cors_configuration {
    allow_methods = ["GET", "OPTIONS"]
    allow_origins = ["https://${var.domain_name}"]
    allow_headers = ["authorization", "content-type"]
    max_age       = 300
  }

  tags = var.tags
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.search.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    audience = [var.cognito_client_id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${var.cognito_user_pool_id}"
  }
}

resource "aws_apigatewayv2_integration" "search_gateway" {
  api_id                 = aws_apigatewayv2_api.search.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.search_gateway.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_lambda_permission" "apigw_invoke" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.search_gateway.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.search.execution_arn}/*/*"
}

resource "aws_apigatewayv2_route" "search" {
  api_id             = aws_apigatewayv2_api.search.id
  route_key          = "GET /search"
  target             = "integrations/${aws_apigatewayv2_integration.search_gateway.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_route" "get_product" {
  api_id             = aws_apigatewayv2_api.search.id
  route_key          = "GET /products/{id}"
  target             = "integrations/${aws_apigatewayv2_integration.search_gateway.id}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.cognito.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.search.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit   = 200
    throttling_rate_limit    = 100
    detailed_metrics_enabled = true
  }
}

#Custom domain — gated. Requires an ACM cert in the same region as the API.
resource "aws_apigatewayv2_domain_name" "search" {
  count       = var.create_custom_domain ? 1 : 0
  domain_name = local.search_host

  domain_name_configuration {
    certificate_arn = var.acm_certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "search" {
  count       = var.create_custom_domain ? 1 : 0
  api_id      = aws_apigatewayv2_api.search.id
  domain_name = aws_apigatewayv2_domain_name.search[0].id
  stage       = aws_apigatewayv2_stage.default.id
}

resource "aws_route53_record" "search" {
  count   = var.create_custom_domain ? 1 : 0
  zone_id = var.route53_zone_id
  name    = local.search_host
  type    = "A"

  alias {
    name                   = aws_apigatewayv2_domain_name.search[0].domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.search[0].domain_name_configuration[0].hosted_zone_id
    evaluate_target_health = false
  }
}
