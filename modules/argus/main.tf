# Argus engine on the cluster (argus serve), for scoring this cluster's
# telemetry with Argus (docs/runbooks/argus.md).
#
# Why in the cluster: Argus scores the OTLP a collector mirrors to it. Argus
# on an operator's machine is out of the collector's reach (nothing in AWS
# calls out to it), so its score would see no telemetry. The observability
# module adds the mirror exporter when argus_otlp_endpoint is set; the
# engine is never in the telemetry's critical path, since the mirror has its
# own queue and only the mirror's data is dropped when the engine is down.
#
# The chart comes from an Argus checkout (var.chart): it is not published to
# a chart registry. The engine image is ghcr.io/tamen25/argus at the chart's
# appVersion.

resource "kubernetes_namespace" "argus" {
  metadata {
    name = var.namespace
  }
}

resource "helm_release" "argus" {
  name      = "argus"
  chart     = var.chart
  namespace = kubernetes_namespace.argus.metadata[0].name
  timeout   = 300

  values = [yamlencode({
    image = var.image_tag == "" ? {} : { tag = var.image_tag }

    resources = {
      requests = { cpu = "200m", memory = "256Mi" }
      limits   = { memory = "1Gi" }
    }

    networkPolicy = {
      enabled = true
      # Prometheus scrapes /metrics and Grafana runs here; both are in the
      # monitoring namespace.
      allowedNamespaces = [var.monitoring_namespace]
      # The OTLP receiver has no authentication: only the collector's
      # namespace may send to it.
      otlpAllowedNamespaces = [var.monitoring_namespace]
    }

    # The score gauges (argus_instrumentation_score{service}) go to Prometheus
    # and on to Mimir, so the scores show in Grafana next to the telemetry.
    serviceMonitor = {
      enabled = true
      labels  = { release = var.prometheus_release }
    }
  })]
}
