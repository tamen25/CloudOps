#gp3 StorageClass — requires the EBS CSI driver addon (installed by the eks module)
#
#It is the cluster's default class. EKS clusters created on Kubernetes 1.30 or
#later have no default class, and several charts here create claims without
#naming one (Loki's write and backend pods, Mimir's alertmanager). Without a
#default those claims stay Pending, the pods never schedule, and the Helm
#release times out.
resource "kubernetes_storage_class" "gp3" {
  metadata {
    name = "gp3"
    annotations = {
      "storageclass.kubernetes.io/is-default-class" = "true"
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

#kube-prometheus-stack — Prometheus + Alertmanager + node-exporter + kube-state-metrics
#Grafana is disabled here; deployed separately in grafana.tf with datasources and dashboards
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
        retention          = var.prometheus_retention
        replicas           = var.prometheus_replicas
        scrapeInterval     = "30s"
        evaluationInterval = "30s"

        #Spread replicas across nodes (and AZs, since node groups are AZ-pinned).
        affinity = var.prometheus_replicas > 1 ? {
          podAntiAffinity = {
            requiredDuringSchedulingIgnoredDuringExecution = [{
              labelSelector = {
                matchLabels = { "app.kubernetes.io/name" = "prometheus" }
              }
              topologyKey = "topology.kubernetes.io/zone"
            }]
          }
        } : null

        #Remote write to Mimir/Thanos when long-term storage is wired up.
        #Mimir distributor address is set by the mimir.tf module.
        remoteWrite = var.metrics_long_term_storage == "mimir" ? [{
          url = "http://mimir-distributor.mimir.svc:8080/api/v1/push"
          headers = {
            "X-Scope-OrgID" = "anonymous"
          }
          writeRelabelConfigs = [{
            sourceLabels = ["__name__"]
            regex        = ".*"
            action       = "keep"
          }]
        }] : []

        #Accept remote write from OTel Collector
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

    #When enabled, kube-prometheus-stack runs an Alertmanager pod that
    #aggregates PrometheusRule alerts. Required for the Grafana
    #Alertmanager datasource (alerting.tf) to actually return data.
    alertmanager = {
      enabled = var.enable_alertmanager
    }

    prometheusOperator = {
      enabled = true
    }
  })]

  depends_on = [kubernetes_namespace.monitoring, kubernetes_storage_class.gp3]
}
