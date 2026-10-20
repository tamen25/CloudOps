output "runner_set_name" {
  description = "Set the DEPLOY_RUNNER repository variable to this to move cluster jobs onto these runners"
  value       = helm_release.runner_set.name
}

output "runner_namespace" {
  description = "Namespace the runner pods run in"
  value       = kubernetes_namespace.runners.metadata[0].name
}
