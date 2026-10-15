# Chaos Mesh, for fault injection: the Argus bench scenarios (I02) and
# game days. The platform stack creates it only with enable_chaos_mesh, which
# is off by default.
#
# Kept narrow:
# - experiments reach only the namespaces in target_namespaces. The
#   controller filters by namespace, and only those namespaces carry the
#   chaos-mesh.org/inject annotation;
# - no dashboard: it can start any experiment, and nothing here needs it;
# - no DNS server: DNSChaos is not used (on 2.8.3 its helper panics).
#
# The chaos daemon runs privileged on every node, so the namespace is exempt
# from Gatekeeper's cluster-wide no-root and no-privileged constraints. The
# security module takes the namespace and exempts it only while this module
# exists.
# Runbook: docs/runbooks/chaos-mesh.md.

resource "helm_release" "chaos_mesh" {
  name             = "chaos-mesh"
  repository       = "https://charts.chaos-mesh.org"
  chart            = "chaos-mesh"
  version          = var.chart_version
  namespace        = var.namespace
  create_namespace = true

  timeout = 300

  values = [yamlencode({
    controllerManager = {
      replicaCount          = 1
      enableFilterNamespace = true
    }
    chaosDaemon = {
      runtime    = "containerd"
      socketPath = "/run/containerd/containerd.sock"
    }
    dashboard = {
      create = false
    }
    dnsServer = {
      create = false
    }
  })]
}

# With enableFilterNamespace, the controller acts only in namespaces that
# carry this annotation.
resource "kubernetes_annotations" "target" {
  for_each = toset(var.target_namespaces)

  api_version = "v1"
  kind        = "Namespace"
  metadata {
    name = each.value
  }
  annotations = {
    "chaos-mesh.org/inject" = "enabled"
  }

  depends_on = [helm_release.chaos_mesh]
}
