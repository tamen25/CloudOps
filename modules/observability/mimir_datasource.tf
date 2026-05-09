#This file defines mimir datasource settings for CloudOps.
#Grafana Prometheus-compatible datasource pointing at Mimir's query-frontend.
#Picked up by the sidecar via grafana_datasource=1 label.
#When Mimir is enabled, this datasource is the long-term backend; the existing
#Prometheus datasource (grafana.tf) covers short-term + recording rules.

resource "kubernetes_config_map" "grafana_mimir_datasource" {
  count = var.metrics_long_term_storage == "mimir" ? 1 : 0

  metadata {
    name      = "grafana-mimir-datasource"
    namespace = "monitoring"
    labels    = { grafana_datasource = "1" }
  }

  data = {
    "mimir.yaml" = yamlencode({
      apiVersion = 1
      datasources = [
        {
          name     = "Mimir"
          type     = "prometheus"
          uid      = "mimir"
          url      = "http://mimir-query-frontend.mimir.svc:8080/prometheus"
          access   = "proxy"
          editable = false
          jsonData = {
            httpMethod            = "POST"
            timeInterval          = "30s"
            customQueryParameters = ""
            httpHeaderName1       = "X-Scope-OrgID"
          }
          secureJsonData = {
            httpHeaderValue1 = "anonymous"
          }
        },
      ]
    })
  }

  depends_on = [helm_release.grafana]
}
