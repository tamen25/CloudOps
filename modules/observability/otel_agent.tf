#OpenTelemetry Collector in AGENT mode (DaemonSet): reads containers' stdout
#from the node's /var/log/pods and forwards it to the gateway collector, so
#services that only log to stdout reach Loki (and the Argus mirror) like the
#ones that export OTLP logs themselves.
#
#Scope: only var.log_collection_namespaces, and in them not the workloads in
#var.log_collection_skip_workloads, whose logs already arrive over OTLP: their
#stdout would be the same lines twice. Logs only; the chart's default trace and
#metric pipelines are removed.

locals {
  log_collection = length(var.log_collection_namespaces) > 0

  #kubelet's layout: /var/log/pods/<namespace>_<pod>_<uid>/<container>/<n>.log
  log_include = [for ns in var.log_collection_namespaces : "/var/log/pods/${ns}_*/*/*.log"]
  log_exclude = flatten([
    for ns in var.log_collection_namespaces : [
      for w in var.log_collection_skip_workloads : "/var/log/pods/${ns}_${w}-*/*/*.log"
    ]
  ])
}

locals {
  otel_agent_values = {
    mode = "daemonset"

    #contrib: bearertokenauth, transform and k8sattributes.
    image = { repository = "otel/opentelemetry-collector-contrib" }

    #filelog with the container parser and /var/log/pods mounted, and the
    #k8sattributes processor with its RBAC.
    presets = {
      logsCollection       = { enabled = true, includeCollectorLogs = false }
      kubernetesAttributes = { enabled = true }
    }

    #It receives nothing over the network: no OTLP, Jaeger or Zipkin ports.
    ports = {
      otlp             = { enabled = false }
      "otlp-http"      = { enabled = false }
      "jaeger-compact" = { enabled = false }
      "jaeger-thrift"  = { enabled = false }
      "jaeger-grpc"    = { enabled = false }
      zipkin           = { enabled = false }
      metrics          = { enabled = false }
    }

    resources = {
      requests = { cpu = "50m", memory = "128Mi" }
      limits   = { memory = "256Mi" }
    }

    #The gateway refuses OTLP without the bearer token.
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
        bearertokenauth = {
          scheme   = "Bearer"
          filename = "/etc/otel/auth/api-key"
        }
      }

      receivers = {
        filelog = {
          include = local.log_include
          exclude = local.log_exclude
        }
      }

      processors = {
        memory_limiter = {
          check_interval         = "1s"
          limit_percentage       = 75
          spike_limit_percentage = 15
        }
        #Stdout carries no service.name; name each line after its workload,
        #as the services that export OTLP name themselves.
        "transform/service-name" = {
          log_statements = [{
            context = "resource"
            statements = [
              "set(attributes[\"service.name\"], attributes[\"k8s.deployment.name\"]) where attributes[\"service.name\"] == nil and attributes[\"k8s.deployment.name\"] != nil",
              "set(attributes[\"service.name\"], attributes[\"k8s.statefulset.name\"]) where attributes[\"service.name\"] == nil and attributes[\"k8s.statefulset.name\"] != nil",
              "set(attributes[\"service.name\"], attributes[\"k8s.container.name\"]) where attributes[\"service.name\"] == nil",
            ]
          }]
        }
        batch = {
          timeout             = "5s"
          send_batch_size     = 1000
          send_batch_max_size = 1000
        }
      }

      exporters = {
        #OTLP/HTTP: gRPC refuses per-RPC bearer credentials over a plaintext
        #connection ("the credentials require transport level security"), and
        #in-cluster traffic to the gateway is plaintext.
        "otlphttp/gateway" = {
          endpoint = "http://opentelemetry-collector.monitoring.svc:4318"
          auth     = { authenticator = "bearertokenauth" }
        }
      }

      service = {
        #health_check serves the chart's probes (it refuses to install
        #without it); this list replaces the default one.
        extensions = ["health_check", "bearertokenauth"]
        pipelines = {
          logs = {
            receivers  = ["filelog"]
            processors = ["memory_limiter", "k8sattributes", "transform/service-name", "batch"]
            exporters  = ["otlphttp/gateway"]
          }
          #null drops the chart's default pipelines from the merged config.
          traces  = null
          metrics = null
        }
      }
    }
  }
}

resource "helm_release" "otel_agent" {
  count = local.log_collection ? 1 : 0

  name       = "otel-agent"
  repository = "https://open-telemetry.github.io/opentelemetry-helm-charts"
  chart      = "opentelemetry-collector"
  version    = "0.97.1"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode(local.otel_agent_values)]

  depends_on = [kubernetes_secret.otel_auth, helm_release.otel_collector]
}
