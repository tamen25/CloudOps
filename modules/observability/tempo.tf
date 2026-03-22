# Tempo — distributed tracing backend with S3 storage and IRSA
resource "helm_release" "tempo" {
  name       = "tempo"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "tempo"
  version    = "1.10.3"
  namespace  = "tempo"

  create_namespace = true
  timeout          = 300

  values = [yamlencode({
    serviceAccount = {
      create = true
      name   = "tempo"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.tempo.arn
      }
    }

    tempo = {
      storage = {
        trace = {
          backend = "s3"
          s3 = {
            bucket   = aws_s3_bucket.tempo.id
            region   = var.region
            endpoint = "s3.${var.region}.amazonaws.com"
          }
        }
      }

      # OTLP receivers for both gRPC and HTTP
      receivers = {
        otlp = {
          protocols = {
            grpc = {
              endpoint = "0.0.0.0:4317"
            }
            http = {
              endpoint = "0.0.0.0:4318"
            }
          }
        }
      }

      # Expose tempo query API on 3100 (used by Grafana datasource)
      server = {
        http_listen_port = 3100
      }
    }

    persistence = {
      enabled          = true
      storageClassName = "gp3"
      size             = "10Gi"
    }

    service = {
      type = "ClusterIP"
    }
  })]

  depends_on = [kubernetes_namespace.monitoring, kubernetes_storage_class.gp3]
}
