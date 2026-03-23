# Grafana with auto-provisioned datasources and dashboard sidecar
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "7.3.11"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode({
    # Admin credentials from the k8s secret created in secrets.tf
    admin = {
      existingSecret = kubernetes_secret.grafana_admin.metadata[0].name
      userKey        = "username"
      passwordKey    = "password"
    }

    persistence = {
      enabled          = true
      storageClassName = "gp3"
      size             = "10Gi"
    }

    # Auto-provision datasources on startup
    datasources = {
      "datasources.yaml" = {
        apiVersion = 1
        datasources = [
          {
            name      = "Prometheus"
            type      = "prometheus"
            uid       = "prometheus"
            url       = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090"
            isDefault = true
            editable  = false
          },
          {
            name     = "Loki"
            type     = "loki"
            uid      = "loki"
            url      = "http://loki-gateway.loki.svc"
            editable = false
          },
          {
            name     = "Tempo"
            type     = "tempo"
            uid      = "tempo"
            url      = "http://tempo.tempo.svc:3100"
            editable = false
            jsonData = {
              tracesToLogsV2 = {
                datasourceUid      = "loki"
                spanStartTimeShift = "-1h"
                spanEndTimeShift   = "1h"
              }
              serviceMap = {
                datasourceUid = "prometheus"
              }
              lokiSearch = {
                datasourceUid = "loki"
              }
            }
          },
        ]
      }
    }

    # Sidecar watches for ConfigMaps labelled grafana_dashboard=1 across all namespaces
    sidecar = {
      dashboards = {
        enabled         = true
        searchNamespace = "ALL"
        label           = "grafana_dashboard"
        labelValue      = "1"
        folder          = "/var/lib/grafana/dashboards"
        provider = {
          foldersFromFilesStructure = true
        }
      }
    }

    # Ingress — ALB terminates TLS; Grafana runs plain HTTP inside the cluster
    ingress = {
      enabled = true
      annotations = {
        "kubernetes.io/ingress.class"                    = "alb"
        "alb.ingress.kubernetes.io/scheme"               = "internet-facing"
        "alb.ingress.kubernetes.io/target-type"          = "ip"
        "alb.ingress.kubernetes.io/certificate-arn"      = var.acm_cert_arn
        "alb.ingress.kubernetes.io/listen-ports"         = jsonencode([{ HTTPS = 443 }])
        "alb.ingress.kubernetes.io/group.name"           = "cloudops"
        "alb.ingress.kubernetes.io/ssl-redirect"         = "443"
      }
      hosts    = ["grafana.${var.domain}"]
      path     = "/"
      pathType = "Prefix"
    }

    grafana = {
      "ini" = {
        server = {
          root_url = "https://grafana.${var.domain}"
        }
        auth = {
          disable_login_form = false
        }
      }
    }

    serviceMonitor = {
      enabled = true
    }
  })]

  depends_on = [
    kubernetes_secret.grafana_admin,
    kubernetes_storage_class.gp3,
    helm_release.prometheus,
    helm_release.loki,
    helm_release.tempo,
  ]
}
