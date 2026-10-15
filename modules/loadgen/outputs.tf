output "control_service_dns" {
  description = "In-cluster DNS of the loadgen control API."
  value       = module.control.service_dns
}

output "control_service_url" {
  value = module.control.service_url
}
