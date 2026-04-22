# OpenTelemetry Collector in GATEWAY mode (Deployment, not DaemonSet)
# All SDK clients send telemetry to this central collector inside the cluster
resource "helm_release" "otel_collector" {
  name       = "opentelemetry-collector"
  repository = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart      = "opentelemetry-collector"
  version    = "0.97.1"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode({
    # Gateway mode — runs as a Deployment rather than DaemonSet
    mode         = "deployment"
    replicaCount = 2

    # Expose OTLP gRPC (4317) and HTTP (4318) as named service ports
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

    # Mount the otel-auth k8s secret as a file — bearertokenauth reads token from this path
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
        # Reads the bearer token from the mounted k8s secret file
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

        # Inject cluster and environment as resource attributes on all telemetry
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

      exporters = {
        # Traces → Tempo via OTLP HTTP
        "otlphttp/tempo" = {
          endpoint = "http://tempo.tempo.svc:4318"
          tls      = { insecure = true }
        }

        # Metrics → Prometheus remote write
        prometheusremotewrite = {
          endpoint = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090/api/v1/write"
          tls      = { insecure_skip_verify = true }
        }

        # Logs → Loki gateway; promote service.name, level, trace_id as Loki labels
        loki = {
          endpoint = "http://loki-gateway.loki.svc/loki/api/v1/push"
          default_labels_enabled = {
            exporter = false
            job      = true
          }
          labels = {
            resource = {
              "service.name" = "service_name"
            }
            attributes = {
              level    = "level"
              trace_id = "trace_id"
            }
          }
        }
      }

      service = {
        extensions = ["bearertokenauth"]
        pipelines = {
          traces = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = ["otlphttp/tempo"]
          }
          metrics = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = ["prometheusremotewrite"]
          }
          logs = {
            receivers  = ["otlp"]
            processors = ["memory_limiter", "resource", "batch"]
            exporters  = ["loki"]
          }
        }
      }
    }
  })]

  depends_on = [kubernetes_secret.otel_auth, helm_release.prometheus, helm_release.loki, helm_release.tempo]
}

# A record for otel.${var.domain} — created after first deploy once ALB DNS is known
resource "aws_route53_record" "otel" {
  count = var.alb_dns_name != "" ? 1 : 0

  zone_id = var.zone_id
  name    = "otel.${var.domain}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

# Ingress for OTel Collector HTTP endpoint (OTLP/HTTP, port 4318)
# TLS is terminated at the ALB; backend is plain HTTP.
resource "kubernetes_ingress_v1" "otel_http" {
  metadata {
    name      = "otel-collector-http"
    namespace = "monitoring"
    annotations = {
      "kubernetes.io/ingress.class"                    = "alb"
      "alb.ingress.kubernetes.io/scheme"               = "internet-facing"
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

# Ingress for OTel Collector gRPC endpoint (OTLP/gRPC, port 4317)
# ALB backend-protocol GRPC uses HTTP/2 to forward to the collector pod.
# NOTE: ALB requires the backend to accept clear-text HTTP/2 (h2c) on port 4317.
resource "kubernetes_ingress_v1" "otel_grpc" {
  metadata {
    name      = "otel-collector-grpc"
    namespace = "monitoring"
    annotations = {
      "kubernetes.io/ingress.class"                    = "alb"
      "alb.ingress.kubernetes.io/scheme"               = "internet-facing"
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
