output "acm_certificate_arn" {
  value = var.enable_ingress ? module.ingress[0].certificate_arn : null
}

output "grafana_url" {
  value = var.enable_observability ? module.observability[0].grafana_url : null
}

output "grafana_admin_password" {
  value     = var.enable_observability ? module.observability[0].grafana_admin_password : null
  sensitive = true
}

output "otel_endpoint" {
  value = var.enable_observability ? module.observability[0].otel_endpoint : null
}

output "otel_url" {
  value = var.enable_observability && var.otel_alb_dns_name != "" ? "https://otel.${var.domain_name}" : null
}

output "otel_api_key" {
  value     = var.enable_observability ? module.observability[0].otel_api_key : null
  sensitive = true
}

output "grafana_api_key_secret_arn" {
  value = var.enable_observability ? module.observability[0].grafana_api_key_secret_arn : null
}

output "slo_lambda_arn" {
  value = var.enable_slo ? module.slo[0].lambda_arn : null
}

output "security_alerts_topic_arn" {
  value = var.enable_security ? module.security[0].security_alerts_topic_arn : null
}

output "compliance_scanner_function_arn" {
  value = var.enable_security ? module.security[0].compliance_scanner_function_arn : null
}

output "auto_remediation_function_arn" {
  value = var.enable_security ? module.security[0].auto_remediation_function_arn : null
}

output "finops_cost_lambda_arn" {
  value = var.enable_finops ? module.finops[0].lambda_arn : null
}

output "finops_budget_name" {
  value = var.enable_finops ? module.finops[0].budget_name : null
}

output "self_healing_lambda_arn" {
  value = var.enable_self_healing ? module.self_healing[0].lambda_arn : null
}

output "self_healing_sns_topic_arn" {
  value = var.enable_self_healing ? module.self_healing[0].sns_topic_arn : null
}

output "self_healing_dashboard_url" {
  value = var.enable_self_healing ? module.self_healing[0].healing_dashboard_url : null
}

output "order_api_url" {
  value = "https://api.${var.domain_name}"
}
