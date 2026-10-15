output "user_pool_id" {
  description = "Cognito User Pool ID."
  value       = aws_cognito_user_pool.storefront.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN."
  value       = aws_cognito_user_pool.storefront.arn
}

output "user_pool_endpoint" {
  description = "Cognito User Pool endpoint host (cognito-idp.<region>.amazonaws.com/<pool-id>)."
  value       = aws_cognito_user_pool.storefront.endpoint
}

output "issuer_url" {
  description = "OIDC issuer URL — feed into OIDC_ISSUER on storefront + order-api."
  value       = "https://${aws_cognito_user_pool.storefront.endpoint}"
}

output "jwks_url" {
  description = "OIDC JWKS URL — feed into OIDC_JWKS_URL on storefront + order-api."
  value       = "https://${aws_cognito_user_pool.storefront.endpoint}/.well-known/jwks.json"
}

output "storefront_client_id" {
  description = "Storefront app client ID — feed into OIDC_AUDIENCE and OIDC_CLIENT_ID."
  value       = aws_cognito_user_pool_client.storefront.id
}

output "hosted_ui_domain" {
  description = "Hosted UI domain (auth.<domain_name>). Empty when create_hosted_ui_domain=false."
  value       = var.create_hosted_ui_domain ? "auth.${var.domain_name}" : ""
}

output "hosted_ui_authorize_url" {
  description = "Hosted UI authorize endpoint — used by storefront /login redirect."
  value       = var.create_hosted_ui_domain ? "https://auth.${var.domain_name}/oauth2/authorize" : ""
}

output "hosted_ui_token_url" {
  description = "Hosted UI token endpoint — used by storefront /auth/callback to exchange code for tokens."
  value       = var.create_hosted_ui_domain ? "https://auth.${var.domain_name}/oauth2/token" : ""
}

output "hosted_ui_logout_url" {
  description = "Hosted UI logout endpoint."
  value       = var.create_hosted_ui_domain ? "https://auth.${var.domain_name}/logout" : ""
}

output "admin_group_name" {
  description = "Cognito group name for storefront admins."
  value       = aws_cognito_user_group.admin.name
}
