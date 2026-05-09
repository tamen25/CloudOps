#This file defines tempo settings for CloudOps.
#Tempo — distributed tracing backend with S3 storage and IRSA
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
        trace = merge(
          {
            backend = "s3"
            s3 = merge(
              {
                bucket   = aws_s3_bucket.tempo.id
                region   = var.region
                endpoint = "s3.${var.region}.amazonaws.com"
              },
              var.buckets_kms_cmk ? {
                sse_encryption = true
                sse_kms_key_id = aws_kms_key.tempo[0].arn
              } : {}
            )
          },
          {}
        )
      }

      #OTLP receivers for both gRPC and HTTP
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

      #Expose tempo query API on 3100 (used by Grafana datasource)
      server = {
        http_listen_port = 3100
      }

      #Metrics generator derives RED metrics (rate/errors/duration) from spans
      #and remote-writes them to Prometheus. Useful for service maps in Grafana.
      metricsGenerator = var.tempo_metrics_generator_enabled ? {
        enabled        = true
        remoteWriteUrl = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090/api/v1/write"
      } : { enabled = false }
    }

    ingester = {
      replicas = var.tempo_ingester_replicas
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
