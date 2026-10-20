output "namespace" {
  description = "Namespace Chaos Mesh runs in (exempted from the cluster-wide Gatekeeper constraints)"
  value       = helm_release.chaos_mesh.namespace
}
