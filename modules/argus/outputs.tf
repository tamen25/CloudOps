output "otlp_endpoint" {
  description = "OTLP gRPC address of the engine's receiver, for the collector's mirror exporter"
  value       = "argus.${var.namespace}.svc:4317"
}

output "api_url" {
  description = "The engine's HTTP API inside the cluster (bearer token in the argus Secret, key api-token)"
  value       = "http://argus.${var.namespace}.svc:8080"
}
