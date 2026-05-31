#Outputs for the mesh-service module.

output "service_dns" {
  description = "In-cluster DNS name of the service (port 80)."
  value       = "${kubernetes_service_v1.this.metadata[0].name}.${var.namespace}.svc.cluster.local"
}

output "service_url" {
  description = "Base HTTP URL other mesh services use to call this one."
  value       = "http://${kubernetes_service_v1.this.metadata[0].name}.${var.namespace}.svc.cluster.local"
}

output "service_account_name" {
  description = "Name of the created ServiceAccount."
  value       = kubernetes_service_account_v1.this.metadata[0].name
}
