#Loki — simple scalable mode with S3 backend and IRSA for bucket access
resource "helm_release" "loki" {
  name       = "loki"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki"
  version    = "6.6.2"
  namespace  = "loki"

  create_namespace = true
  timeout          = 600

  values = [yamlencode({
    deploymentMode = "SimpleScalable"

    serviceAccount = {
      create = true
      name   = "loki"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.loki.arn
      }
    }

    loki = {
      auth_enabled = false

      commonConfig = {
        replication_factor = var.loki_replication_factor
      }

      storage = {
        type = "s3"
        bucketNames = {
          chunks = aws_s3_bucket.loki.id
          ruler  = aws_s3_bucket.loki.id
          admin  = aws_s3_bucket.loki.id
        }
        s3 = {
          region           = var.region
          s3ForcePathStyle = false
          sse_encryption   = var.buckets_kms_cmk
          sse = var.buckets_kms_cmk ? {
            type       = "SSE-KMS"
            kms_key_id = aws_kms_key.loki[0].arn
          } : null
        }
      }

      schemaConfig = {
        configs = [{
          from         = "2024-01-01"
          store        = "tsdb"
          object_store = "s3"
          schema       = "v12"
          index = {
            prefix = "index_"
            period = "24h"
          }
        }]
      }

      limits_config = {
        retention_period        = "168h"
        ingestion_rate_mb       = 16
        ingestion_burst_size_mb = 32
      }

      compactor = {
        retention_enabled = true
      }
    }

    #Simple scalable components — replicas driven by vars so prod can flip up.
    write = {
      replicas = var.loki_write_replicas
    }
    read = {
      replicas = var.loki_read_replicas
    }
    backend = {
      replicas = 1
    }

    gateway = {
      enabled = true
      service = {
        type = "ClusterIP"
      }
    }

    #Disable built-in MinIO
    minio = {
      enabled = false
    }
  })]

  depends_on = [kubernetes_namespace.monitoring, helm_release.prometheus]
}
