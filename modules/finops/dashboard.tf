# FinOps Grafana Dashboard
#
# Loads finops.json into a ConfigMap with label grafana_dashboard=1 so the
# Grafana sidecar (searchNamespace=ALL) auto-provisions it into Grafana.
#
# Dashboard prerequisite: panels query CloudWatch namespace CloudOps/FinOps
# and CloudWatch Logs Insights on Lambda structured logs. A CloudWatch
# datasource with uid="cloudwatch" must be added to the datasources list in
# modules/observability/grafana.tf:
#
#   {
#     name     = "AWS CloudWatch"
#     type     = "cloudwatch"
#     uid      = "cloudwatch"
#     jsonData = { defaultRegion = var.region }
#     editable = false
#   }

resource "kubernetes_config_map" "finops_dashboard" {
  count = var.eks_cluster_name != "" ? 1 : 0

  metadata {
    name      = "finops-dashboard"
    namespace = "monitoring"
    labels = {
      grafana_dashboard = "1"
    }
  }

  data = {
    "finops.json" = file("${path.module}/../observability/dashboards/finops.json")
  }
}
