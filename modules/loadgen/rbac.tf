# Chaos RBAC (#143). Created ONLY when enable_chaos = true. Grants the loadgen
# control ServiceAccount the minimum to find + delete one mesh pod:
#   - get/list/watch pods  (find the target by label)
#   - delete pods          (the actual fault injection)
# Scope is a namespace Role (NOT ClusterRole) bound only in var.namespace, so the
# token can never touch kube-system, observability, or any other namespace. The
# app layers two more guards on top (fixed mesh allowlist + dry-run default), so
# even within this namespace it will not kill loadgen itself or batch-delete.
#
# Recovery is automatic: every mesh service is a Deployment with a ReplicaSet, so
# a deleted pod is rescheduled by Kubernetes — the trace map shows the error edge
# then the recovery. See docs/runbooks/security/chaos-pod-kill.md.

resource "kubernetes_role_v1" "chaos" {
  count = var.enable_chaos ? 1 : 0

  metadata {
    name      = "loadgen-chaos"
    namespace = var.namespace
    labels    = local.common_labels
  }

  rule {
    api_groups = [""]
    resources  = ["pods"]
    verbs      = ["get", "list", "watch", "delete"]
  }
}

resource "kubernetes_role_binding_v1" "chaos" {
  count = var.enable_chaos ? 1 : 0

  metadata {
    name      = "loadgen-chaos"
    namespace = var.namespace
    labels    = local.common_labels
  }

  role_ref {
    api_group = "rbac.authorization.k8s.io"
    kind      = "Role"
    name      = kubernetes_role_v1.chaos[0].metadata[0].name
  }

  # Bind to the control Deployment's SA (created by the mesh module).
  subject {
    kind      = "ServiceAccount"
    name      = module.control.service_account_name
    namespace = var.namespace
  }
}
