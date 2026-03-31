# Falco Runtime Threat Detection
# Installs Falco as a DaemonSet using the eBPF driver (no kernel module compilation
# required on EKS). Falcosidekick routes findings to the existing OTel Collector
# log pipeline, where they flow into Loki for querying from Grafana.
#
# Deploy order: after observability (requires otel-auth secret in monitoring ns)

resource "kubernetes_namespace" "falco" {
  metadata {
    name = "falco"
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
    }
  }
}

# ── OTel auth header secret (falco namespace copy) ────────────────────────────
# Falcosidekick runs in the falco namespace. This secret pre-formats the full
# Authorization header value using the OTel API key passed from the observability
# module, avoiding a cross-namespace Kubernetes data source read.

resource "kubernetes_secret" "falco_otel_auth" {
  metadata {
    name      = "otel-auth"
    namespace = kubernetes_namespace.falco.metadata[0].name
  }

  data = {
    # Falcosidekick customHeaders format: "HeaderName:HeaderValue"
    "custom-headers" = "Authorization:Bearer ${var.otel_api_key}"
  }
}

# ── Falco DaemonSet via Helm ──────────────────────────────────────────────────

resource "helm_release" "falco" {
  name       = "falco"
  repository = "https://falcosecurity.github.io/charts"
  chart      = "falco"
  version    = "4.5.0"
  namespace  = kubernetes_namespace.falco.metadata[0].name

  timeout = 300

  values = [yamlencode({
    # Use eBPF driver — avoids kernel module compilation, compatible with
    # Amazon Linux 2 / Bottlerocket EKS AMIs without extra node setup.
    driver = {
      kind = "ebpf"
    }

    falco = {
      # gRPC socket — used by Falcosidekick to receive findings from the agent
      grpc = {
        enabled      = true
        bind_address = "unix:///run/falco/falco.sock"
        threadiness  = 0
      }
      grpc_output = {
        enabled = true
      }
      json_output = true
      log_level   = "info"
    }

    # DaemonSet pod resources
    resources = {
      requests = {
        cpu    = "100m"
        memory = "512Mi"
      }
      limits = {
        cpu    = "1000m"
        memory = "1024Mi"
      }
    }

    # Mount the CloudOps custom rules ConfigMap into Falco's rules.d directory.
    # Falco loads all *.yaml files under /etc/falco/rules.d/ at startup.
    extraVolumes = [
      {
        name = "cloudops-rules"
        configMap = {
          name = kubernetes_config_map.falco_cloudops_rules.metadata[0].name
        }
      }
    ]

    extraVolumeMounts = [
      {
        name      = "cloudops-rules"
        mountPath = "/etc/falco/rules.d/cloudops_rules.yaml"
        subPath   = "cloudops_rules.yaml"
        readOnly  = true
      }
    ]

    # Falcosidekick — routes Falco findings to external sinks.
    # Configured to POST NDJSON to the OTel Collector log receiver.
    # The Authorization header is injected via env var from the otel-auth secret
    # to keep the bearer token out of Helm values and Terraform state.
    falcosidekick = {
      enabled = true

      config = {
        webhook = {
          address         = "http://opentelemetry-collector.monitoring.svc.cluster.local:4318/v1/logs"
          minimumPriority = "debug"
        }
      }

      # FALCOSIDEKICK_WEBHOOK_CUSTOMHEADERS overrides config.webhook.customHeaders.
      # Value format: "HeaderName:HeaderValue" (Falcosidekick parses on the colon).
      extraEnv = [
        {
          name = "FALCOSIDEKICK_WEBHOOK_CUSTOMHEADERS"
          valueFrom = {
            secretKeyRef = {
              name = kubernetes_secret.falco_otel_auth.metadata[0].name
              key  = "custom-headers"
            }
          }
        }
      ]
    }
  })]

  depends_on = [
    kubernetes_namespace.falco,
    kubernetes_secret.falco_otel_auth,
    kubernetes_config_map.falco_cloudops_rules,
  ]
}
