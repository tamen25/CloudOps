output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "https://grafana.${var.domain}"
}

output "grafana_admin_password" {
  description = "Grafana admin password"
  value       = random_password.grafana_admin.result
  sensitive   = true
}

output "otel_endpoint" {
  description = "OTel Collector HTTP endpoint (OTLP/HTTP, port 443)"
  value       = "https://otel.${var.domain}"
}

output "otel_api_key" {
  description = "Bearer token required by the OTel Collector bearertokenauth extension"
  value       = random_password.otel_api_key.result
  sensitive   = true
}

output "otel_ssm_parameter_names" {
  description = "SSM Parameter Store names for OTel SDK/client configuration. Empty when publish_otel_ssm_config=false."
  value = var.publish_otel_ssm_config ? {
    endpoint         = aws_ssm_parameter.otel_endpoint[0].name
    metrics_endpoint = aws_ssm_parameter.otel_endpoint_metrics[0].name
    traces_endpoint  = aws_ssm_parameter.otel_endpoint_traces[0].name
    logs_endpoint    = aws_ssm_parameter.otel_endpoint_logs[0].name
    api_key          = aws_ssm_parameter.otel_api_key[0].name
  } : {}
}

output "otel_ssm_parameter_arns" {
  description = "SSM Parameter Store ARNs for OTel SDK/client configuration. Empty when publish_otel_ssm_config=false."
  value = var.publish_otel_ssm_config ? {
    endpoint         = aws_ssm_parameter.otel_endpoint[0].arn
    metrics_endpoint = aws_ssm_parameter.otel_endpoint_metrics[0].arn
    traces_endpoint  = aws_ssm_parameter.otel_endpoint_traces[0].arn
    logs_endpoint    = aws_ssm_parameter.otel_endpoint_logs[0].arn
    api_key          = aws_ssm_parameter.otel_api_key[0].arn
  } : {}
}

output "prometheus_url" {
  description = "Prometheus URL (cluster-internal)"
  value       = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090"
}

output "loki_url" {
  description = "Loki gateway URL (cluster-internal)"
  value       = "http://loki-gateway.loki.svc"
}

output "tempo_url" {
  description = "Tempo URL (cluster-internal)"
  value       = "http://tempo.tempo.svc:3100"
}

output "loki_bucket" {
  description = "Loki S3 bucket name"
  value       = aws_s3_bucket.loki.id
}

output "tempo_bucket" {
  description = "Tempo S3 bucket name"
  value       = aws_s3_bucket.tempo.id
}

output "grafana_api_key_secret_arn" {
  description = "Secrets Manager ARN containing the Grafana Viewer service account token — passed to the SLO Lambda so it can query Prometheus via the Grafana datasource proxy"
  value       = aws_secretsmanager_secret.grafana_api_key.arn
}

output "mimir_url" {
  description = "In-cluster Mimir gateway (Prometheus API under /prometheus); empty unless metrics_long_term_storage is mimir"
  value       = var.metrics_long_term_storage == "mimir" ? "http://mimir-gateway.mimir.svc" : ""
}
