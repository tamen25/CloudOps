#OpenTelemetry Collector in GATEWAY mode (Deployment, not DaemonSet)
#All SDK clients send telemetry to this central collector inside the cluster

locals {
  #With argus_otlp_endpoint set, every signal is also mirrored to the Argus
  #engine (modules/argus). Its own exporter and queue: when the engine is down
  #only the mirror's data is dropped; Tempo, Prometheus and Loki are unaffected.
  argus_mirror   = var.argus_otlp_endpoint != ""
  argus_exporter = local.argus_mirror ? ["otlp/argus"] : []
  argus_exporter_cf = local.argus_mirror ? {
    "otlp/argus" = {
      endpoint      = var.argus_otlp_endpoint
      tls           = { insecure = true }
      sending_queue = { enabled = true, queue_size = 1000 }
      retry_on_failure = {
        enabled          = true
        max_elapsed_time = "60s"
      }
    }
  } : {}
}

resource "helm_release" "otel_collector" {
  name       = "opentelemetry-collector"
  repository = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart      = "opentelemetry-collector"
  version    = "0.97.1"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode({
    #Gateway mode — runs as a Deployment rather than DaemonSet
    mode         = "deployment"
    replicaCount = 2

    #The chart has no default image and refuses to render without one. The
    #contrib distribution, because this config needs the bearertokenauth
    #extension, which the core and k8s ones lack. The
    #tag defaults to the chart's appVersion (0.104.0).
    image = { repository = "otel/opentelemetry-collector-contrib" }

    #Expose OTLP gRPC (4317) and HTTP (4318) as named service ports
    ports = {
      otlp = {
        enabled       = true
        containerPort = 4317
        servicePort   = 4317
        protocol      = "TCP"
        appProtocol   = "grpc"
      }
      "otlp-http" = {
        enabled       = true
        containerPort = 4318
        servicePort   = 4318
        protocol      = "TCP"
      }
    }

    #Mount the otel-auth k8s secret as a file — bearertokenauth reads token from this path
    extraVolumes = [{
      name   = "otel-auth"
      secret = { secretName = "otel-auth" }
    }]

    extraVolumeMounts = [{
      name      = "otel-auth"
      mountPath = "/etc/otel/auth"
      readOnly  = true
    }]

    config = {
      extensions = {
        #Reads the bearer token from the mounted k8s secret file
        bearertokenauth = {
          scheme   = "Bearer"
          filename = "/etc/otel/auth/api-key"
        }
      }

      receivers = {
        otlp = {
          protocols = {
            grpc = {
              endpoint = "0.0.0.0:4317"
              auth     = { authenticator = "bearertokenauth" }
            }
            http = {
              endpoint = "0.0.0.0:4318"
              auth     = { authenticator = "bearertokenauth" }
            }
          }
        }
      }

      processors = {
        memory_limiter = {
          check_interval         = "1s"
          limit_percentage       = 75
          spike_limit_percentage = 15
        }

        #Inject cluster and environment as resource attributes on all telemetry
        resource = {
          attributes = [
            { key = "cluster", value = var.eks_cluster_name, action = "upsert" },
            { key = "environment", value = var.environment, action = "upsert" },
          ]
        }

        batch = {
          timeout             = "5s"
          send_batch_max_size = 1000
        }
      }

      exporters = merge(local.argus_exporter_cf, {
        #Traces → Tempo via OTLP HTTP
        "otlphttp/tempo" = {
          endpoint = "http://tempo.tempo.svc:4318"
          tls      = { insecure = true }
        }

        #Metrics → Prometheus remote write
        prometheusremotewrite = {
          endpoint = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090/api/v1/write"
          tls      = { insecure_skip_verify = true }
        }

        #Logs → Loki's native OTLP endpoint (Loki 3, schema v13). The contrib
        #loki exporter is deprecated, and from 0.104 refuses its `labels`
        #block. Loki indexes service.name as service_name; severity and
        #trace_id arrive as structured metadata, queryable without being
        #index labels.
        "otlphttp/loki" = {
          endpoint = "http://loki-gateway.loki.svc/otlp"
          tls      = { insecure = true }
        }
      })

      service = {
        # health_check serves the chart's probes; the chart refuses to
        # install without it, and this list replaces its default one.
        extensions = ["health_check", "bearertokenauth"]
        pipelines = {
          traces = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = concat(["otlphttp/tempo"], local.argus_exporter)
          }
          metrics = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = concat(["prometheusremotewrite"], local.argus_exporter)
          }
          logs = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = concat(["otlphttp/loki"], local.argus_exporter)
          }
        }
      }
    }
  })]

  depends_on = [kubernetes_secret.otel_auth, helm_release.prometheus, helm_release.loki, helm_release.tempo]
}

#Ingress for OTel Collector HTTP endpoint (OTLP/HTTP, port 4318)
#TLS is terminated at the ALB; backend is plain HTTP.
resource "kubernetes_ingress_v1" "otel_http" {
  count = var.acm_cert_arn != "" ? 1 : 0

  metadata {
    name      = "otel-collector-http"
    namespace = "monitoring"
    annotations = {
      "kubernetes.io/ingress.class"                    = "alb"
      "alb.ingress.kubernetes.io/scheme"               = var.otel_ingestion_internal ? "internal" : "internet-facing"
      "alb.ingress.kubernetes.io/target-type"          = "ip"
      "alb.ingress.kubernetes.io/certificate-arn"      = var.acm_cert_arn
      "alb.ingress.kubernetes.io/listen-ports"         = jsonencode([{ HTTPS = 443 }])
      "alb.ingress.kubernetes.io/group.name"           = "cloudops-otel"
      "alb.ingress.kubernetes.io/group.order"          = "10"
      "alb.ingress.kubernetes.io/backend-protocol"     = "HTTP"
      "alb.ingress.kubernetes.io/healthcheck-path"     = "/"
      "alb.ingress.kubernetes.io/healthcheck-protocol" = "HTTP"
    }
  }

  spec {
    rule {
      host = "otel.${var.domain}"
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = "opentelemetry-collector"
              port { number = 4318 }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.otel_collector]
}

#Ingress for OTel Collector gRPC endpoint (OTLP/gRPC, port 4317)
#ALB backend-protocol GRPC uses HTTP/2 to forward to the collector pod.
#NOTE: ALB requires the backend to accept clear-text HTTP/2 (h2c) on port 4317.
resource "kubernetes_ingress_v1" "otel_grpc" {
  count = var.acm_cert_arn != "" ? 1 : 0

  metadata {
    name      = "otel-collector-grpc"
    namespace = "monitoring"
    annotations = {
      "kubernetes.io/ingress.class"                    = "alb"
      "alb.ingress.kubernetes.io/scheme"               = var.otel_ingestion_internal ? "internal" : "internet-facing"
      "alb.ingress.kubernetes.io/target-type"          = "ip"
      "alb.ingress.kubernetes.io/certificate-arn"      = var.acm_cert_arn
      "alb.ingress.kubernetes.io/listen-ports"         = jsonencode([{ HTTPS = 443 }])
      "alb.ingress.kubernetes.io/group.name"           = "cloudops-otel"
      "alb.ingress.kubernetes.io/group.order"          = "20"
      "alb.ingress.kubernetes.io/backend-protocol"     = "GRPC"
      "alb.ingress.kubernetes.io/conditions.otel-grpc" = jsonencode([{ field = "http-request-method", httpRequestMethodConfig = { values = ["POST"] } }])
    }
  }

  spec {
    rule {
      host = "otel.${var.domain}"
      http {
        path {
          path      = "/"
          path_type = "Prefix"
          backend {
            service {
              name = "opentelemetry-collector"
              port { number = 4317 }
            }
          }
        }
      }
    }
  }

  depends_on = [helm_release.otel_collector]
}

# The OTel ingresses gained a count (none without a certificate).
moved {
  from = kubernetes_ingress_v1.otel_http
  to   = kubernetes_ingress_v1.otel_http[0]
}

moved {
  from = kubernetes_ingress_v1.otel_grpc
  to   = kubernetes_ingress_v1.otel_grpc[0]
}
