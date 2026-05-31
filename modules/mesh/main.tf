#Generic mesh-service: Deployment + Service + ServiceAccount (+ optional HPA)
#+ NetworkPolicy. securityContext mirrors apps/order-api (non-root, read-only
#root FS, drop ALL caps, RuntimeDefault seccomp). OTel env wired the same way
#as the per-app deployment manifests; the SDK no-ops when otel_endpoint == "".

locals {
  common_labels = merge({
    app                            = var.name
    "mesh.cloudops/lang"           = var.lang
    "app.kubernetes.io/managed-by" = "terraform"
  }, var.tags)

  base_env = merge({
    PORT                        = tostring(var.container_port)
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint
    OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"
    OTEL_SERVICE_NAME           = var.name
    OTEL_RESOURCE_ATTRIBUTES    = var.otel_resource_attributes
  }, var.env)
}

resource "kubernetes_service_account_v1" "this" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.common_labels
    annotations = var.irsa_role_arn == "" ? {} : {
      "eks.amazonaws.com/role-arn" = var.irsa_role_arn
    }
  }
}

resource "kubernetes_deployment_v1" "this" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.common_labels
  }

  spec {
    replicas = var.replicas

    selector {
      match_labels = { app = var.name }
    }

    template {
      metadata {
        labels = local.common_labels
      }

      spec {
        service_account_name = kubernetes_service_account_v1.this.metadata[0].name

        security_context {
          run_as_non_root = true
          run_as_user     = var.run_as_user
          run_as_group    = var.run_as_user
          fs_group        = var.run_as_user
          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        dynamic "volume" {
          for_each = var.needs_tmp_volume ? [1] : []
          content {
            name = "tmp"
            empty_dir {}
          }
        }

        container {
          name  = var.name
          image = var.image

          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = true
            capabilities {
              drop = ["ALL"]
            }
          }

          port {
            name           = "http"
            container_port = var.container_port
          }

          resources {
            requests = {
              cpu    = var.cpu_request
              memory = var.memory_request
            }
            limits = {
              cpu    = var.cpu_limit
              memory = var.memory_limit
            }
          }

          dynamic "env" {
            for_each = local.base_env
            content {
              name  = env.key
              value = env.value
            }
          }

          #OTel bearer token, mounted optionally so the service still starts
          #when the otel-auth Secret is absent (otel_endpoint empty path).
          env {
            name = "OTEL_API_KEY"
            value_from {
              secret_key_ref {
                name     = var.otel_auth_secret_name
                key      = "api-key"
                optional = true
              }
            }
          }

          dynamic "volume_mount" {
            for_each = var.needs_tmp_volume ? [1] : []
            content {
              name       = "tmp"
              mount_path = "/tmp"
            }
          }

          liveness_probe {
            http_get {
              path = "/healthz"
              port = "http"
            }
            initial_delay_seconds = 10
            period_seconds        = 20
            failure_threshold     = 3
          }

          readiness_probe {
            http_get {
              path = "/readyz"
              port = "http"
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            failure_threshold     = 3
          }
        }
      }
    }
  }
}

resource "kubernetes_service_v1" "this" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.common_labels
  }

  spec {
    selector = { app = var.name }
    port {
      name        = "http"
      port        = 80
      target_port = "http"
    }
  }
}

resource "kubernetes_horizontal_pod_autoscaler_v2" "this" {
  count = var.enable_hpa ? 1 : 0

  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.common_labels
  }

  spec {
    min_replicas = var.hpa_min
    max_replicas = var.hpa_max

    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = kubernetes_deployment_v1.this.metadata[0].name
    }

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = var.hpa_cpu_target
        }
      }
    }
  }
}

#Default-deny-ingress NetworkPolicy scoped to this service, opened only to the
#pods in ingress_from_labels (e.g. the gateway/loadgen). Egress is left open so
#the service can reach OTel + downstreams; tighten per-service later (#9 mesh).
resource "kubernetes_network_policy_v1" "this" {
  count = length(var.ingress_from_labels) > 0 ? 1 : 0

  metadata {
    name      = "${var.name}-allow-ingress"
    namespace = var.namespace
    labels    = local.common_labels
  }

  spec {
    pod_selector {
      match_labels = { app = var.name }
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        pod_selector {
          match_labels = var.ingress_from_labels
        }
      }
      ports {
        port     = "http"
        protocol = "TCP"
      }
    }
  }
}
