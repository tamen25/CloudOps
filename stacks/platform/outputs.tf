#This file defines outputs settings for CloudOps.
output "acm_certificate_arn" {
  value = var.enable_ingress ? module.ingress[0].certificate_arn : null
}

#Exposes the grafana URL output value.
output "grafana_url" {
  value = var.enable_observability ? module.observability[0].grafana_url : null
}

#Exposes the grafana admin password output value.
output "grafana_admin_password" {
  value     = var.enable_observability ? module.observability[0].grafana_admin_password : null
  sensitive = true
}

#Exposes the OTel endpoint output value.
output "otel_endpoint" {
  value = var.enable_observability ? module.observability[0].otel_endpoint : null
}

#Exposes the OTel URL output value.
output "otel_url" {
  value = var.enable_observability && var.otel_alb_dns_name != "" ? "https://otel.${var.domain_name}" : null
}

#Exposes the OTel API key output value.
output "otel_api_key" {
  value     = var.enable_observability ? module.observability[0].otel_api_key : null
  sensitive = true
}

#Exposes the OTel SSM parameter names output value.
output "otel_ssm_parameter_names" {
  value = var.enable_observability ? module.observability[0].otel_ssm_parameter_names : {}
}

#Exposes the OTel SSM parameter arns output value.
output "otel_ssm_parameter_arns" {
  value = var.enable_observability ? module.observability[0].otel_ssm_parameter_arns : {}
}

#Exposes the grafana API key secret arn output value.
output "grafana_api_key_secret_arn" {
  value = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : null
}

#Exposes the SLO lambda arn output value.
output "slo_lambda_arn" {
  value = var.enable_slo ? module.slo[0].lambda_arn : null
}

#Exposes the security alerts topic arn output value.
output "security_alerts_topic_arn" {
  value = var.enable_security ? module.security[0].security_alerts_topic_arn : null
}

#Exposes the compliance scanner function arn output value.
output "compliance_scanner_function_arn" {
  value = var.enable_security ? module.security[0].compliance_scanner_function_arn : null
}

#Exposes the auto remediation function arn output value.
output "auto_remediation_function_arn" {
  value = var.enable_security ? module.security[0].auto_remediation_function_arn : null
}

#Exposes the finops cost lambda arn output value.
output "finops_cost_lambda_arn" {
  value = var.enable_finops ? module.finops[0].lambda_arn : null
}

#Exposes the finops budget name output value.
output "finops_budget_name" {
  value = var.enable_finops ? module.finops[0].budget_name : null
}

#Exposes the self healing lambda arn output value.
output "self_healing_lambda_arn" {
  value = var.enable_self_healing ? module.self_healing[0].lambda_arn : null
}

#Exposes the self healing sns topic arn output value.
output "self_healing_sns_topic_arn" {
  value = var.enable_self_healing ? module.self_healing[0].sns_topic_arn : null
}

#Exposes the self healing dashboard URL output value.
output "self_healing_dashboard_url" {
  value = var.enable_self_healing ? module.self_healing[0].healing_dashboard_url : null
}

#Exposes the order API URL output value.
output "order_api_url" {
  value = "https://api.${var.domain_name}"
}

#─── Auth (#80) ────────────────────────────────────────────────────────────
output "cognito_user_pool_id" {
  value = var.enable_auth ? module.auth[0].user_pool_id : null
}

output "cognito_user_pool_arn" {
  value = var.enable_auth ? module.auth[0].user_pool_arn : null
}

output "cognito_issuer_url" {
  description = "Feed into OIDC_ISSUER on storefront + order-api."
  value       = var.enable_auth ? module.auth[0].issuer_url : null
}

output "cognito_jwks_url" {
  description = "Feed into OIDC_JWKS_URL on storefront + order-api."
  value       = var.enable_auth ? module.auth[0].jwks_url : null
}

output "cognito_storefront_client_id" {
  description = "Feed into OIDC_AUDIENCE + OIDC_CLIENT_ID on storefront."
  value       = var.enable_auth ? module.auth[0].storefront_client_id : null
}

output "cognito_hosted_ui_domain" {
  value = var.enable_auth ? module.auth[0].hosted_ui_domain : null
}

output "cognito_hosted_ui_authorize_url" {
  value = var.enable_auth ? module.auth[0].hosted_ui_authorize_url : null
}

output "cognito_hosted_ui_token_url" {
  value     = var.enable_auth ? module.auth[0].hosted_ui_token_url : null
  sensitive = false
}

output "cognito_hosted_ui_logout_url" {
  value = var.enable_auth ? module.auth[0].hosted_ui_logout_url : null
}

#─── Storefront Search (#82) ───────────────────────────────────────────────
output "storefront_search_api_endpoint" {
  value = var.enable_storefront_search ? module.storefront_search[0].api_endpoint : null
}

output "storefront_search_lambda_arn" {
  value = var.enable_storefront_search ? module.storefront_search[0].lambda_role_arn : null
}

#─── Storefront Cart (#84) ─────────────────────────────────────────────────
output "storefront_cart_table_name" {
  value = var.enable_storefront_cart ? module.storefront_cart[0].table_name : null
}

output "storefront_cart_irsa_role_arn" {
  description = "Annotate apps/storefront/k8s/serviceaccount.yaml with this ARN."
  value       = var.enable_storefront_cart ? module.storefront_cart[0].irsa_role_arn : null
}

#─── Storefront Events (#85) ───────────────────────────────────────────────
output "storefront_events_stream_name" {
  value = var.enable_storefront_events ? module.storefront_events[0].stream_name : null
}

output "storefront_events_stream_arn" {
  value = var.enable_storefront_events ? module.storefront_events[0].stream_arn : null
}

#─── Storefront Realtime (#86) ─────────────────────────────────────────────
output "storefront_realtime_ws_url" {
  value = var.enable_storefront_realtime ? module.storefront_realtime[0].ws_url : null
}

output "storefront_realtime_connections_table_name" {
  value = var.enable_storefront_realtime ? module.storefront_realtime[0].connections_table_name : null
}
