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
