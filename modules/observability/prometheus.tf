# gp3 StorageClass — requires the EBS CSI driver addon (installed by the eks module)
resource "kubernetes_storage_class" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "false"
    }
  }

  storage_provisioner    = "ebs.csi.aws.com"
  volume_binding_mode    = "WaitForFirstConsumer"
  allow_volume_expansion = true

  parameters = {
    type      = "gp3"
    fsType    = "ext4"
    encrypted = "true"
  }
}

# kube-prometheus-stack — Prometheus + Alertmanager + node-exporter + kube-state-metrics
# Grafana is disabled here; deployed separately in grafana.tf with datasources and dashboards
resource "helm_release" "prometheus" {
  name       = "prometheus"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  version    = "60.2.0"
  namespace  = "monitoring"

  timeout = 600

  values = [yamlencode({
    grafana = {
      enabled = false
    }

    prometheus = {
      prometheusSpec = {
        retention          = "15d"
        scrapeInterval     = "30s"
        evaluationInterval = "30s"

        # Accept remote write from OTel Collector
        enableRemoteWriteReceiver = true

        storageSpec = {
          volumeClaimTemplate = {
            spec = {
              storageClassName = "gp3"
              accessModes      = ["ReadWriteOnce"]
              resources = {
                requests = {
                  storage = "20Gi"
                }
              }
            }
          }
        }
      }
    }

    alertmanager = {
      enabled = false
    }

    prometheusOperator = {
      enabled = true
    }
  })]

  depends_on = [kubernetes_namespace.monitoring, kubernetes_storage_class.gp3]
}
