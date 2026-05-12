#This file defines dashboards settings for CloudOps.
#ConfigMaps for Grafana dashboard provisioning.
#Each ConfigMap is labelled grafana_dashboard=1 so the Grafana sidecar picks it up.

resource "kubernetes_config_map" "order_api_red" {
  metadata {
    name      = "order-api-red-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "order-api-red.json" = file("${path.module}/dashboards/order-api-red.json")
  }

  depends_on = [helm_release.grafana]
}

#Storefront dashboard (closes backlog #89). Single board covers RSC duration,
#search-gateway cache hit rate, WS health, SF execution status, Kinesis lag,
#CloudFront error rate, Cognito sign-in success.
resource "kubernetes_config_map" "storefront" {
  metadata {
    name      = "storefront-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "storefront.json" = file("${path.module}/dashboards/storefront.json")
  }

  depends_on = [helm_release.grafana]
}

#Creates the kubernetes config map resource named kubernetes overview.
resource "kubernetes_config_map" "kubernetes_overview" {
  metadata {
    name      = "kubernetes-overview-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "kubernetes-overview.json" = file("${path.module}/dashboards/kubernetes-overview.json")
  }

  depends_on = [helm_release.grafana]
}

#Creates the kubernetes config map resource named logs explorer.
resource "kubernetes_config_map" "logs_explorer" {
  metadata {
    name      = "logs-explorer-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "logs-explorer.json" = file("${path.module}/dashboards/logs-explorer.json")
  }

  depends_on = [helm_release.grafana]
}

#Creates the kubernetes config map resource named tempo traces.
resource "kubernetes_config_map" "tempo_traces" {
  metadata {
    name      = "tempo-traces-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "tempo-traces.json" = file("${path.module}/dashboards/tempo-traces.json")
  }

  depends_on = [helm_release.grafana]
}

#Creates the kubernetes config map resource named SLO dashboard.
resource "kubernetes_config_map" "slo_dashboard" {
  metadata {
    name      = "slo-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "slo-dashboard.json" = file("${path.module}/dashboards/slo-dashboard.json")
  }

  depends_on = [helm_release.grafana]
}

#Creates the kubernetes config map resource named operations overview dashboard.
resource "kubernetes_config_map" "operations_overview_dashboard" {
  metadata {
    name      = "operations-overview-dashboard"
    namespace = "monitoring"
    labels    = { grafana_dashboard = "1" }
  }

  data = {
    "operations-overview.json" = file("${path.module}/dashboards/operations-overview.json")
  }

  depends_on = [helm_release.grafana]
}
