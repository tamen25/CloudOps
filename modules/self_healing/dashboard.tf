#Self-Healing Grafana Dashboard
#
#Loads self-healing.json into a ConfigMap with label grafana_dashboard=1 so the
#Grafana sidecar (searchNamespace=ALL) auto-provisions it into Grafana.
#
#Dashboard prerequisites:
#- A CloudWatch datasource with uid="cloudwatch" must be present in grafana.tf:
#{ name="AWS CloudWatch", type="cloudwatch", uid="cloudwatch",
#jsonData={ defaultRegion = var.region }, editable=false }
#- Lambda log group /aws/lambda/<project>-self-healing-controller must exist
#(created by lambda.tf aws_cloudwatch_log_group resource)
#- CloudWatch namespace CloudOps/SelfHealing must be receiving data from the
#controller Lambda (happens automatically once healing actions fire)

resource "kubernetes_config_map" "self_healing_dashboard" {
  metadata {
    name      = "self-healing-dashboard"
    namespace = "monitoring"
    labels = {
      grafana_dashboard = "1"
    }
  }

  data = {
    "self-healing.json" = file("${path.module}/../observability/dashboards/self-healing.json")
  }
}
