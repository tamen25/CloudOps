#loadgen: control-API Deployment + Service (via the generic mesh module) plus a
#steady-trickle CronJob that runs the same image with RUN_ON_START so the
#service map is never empty. The trickle is intentionally low-rps and bounded.

locals {
  common_labels = merge({
    app                            = "loadgen"
    "mesh.cloudops/lang"           = "node"
    "app.kubernetes.io/managed-by" = "terraform"
  }, var.tags)
}

#Control-API Deployment + Service reuse the mesh module (same securityContext,
#probes, OTel wiring). No ingress NetworkPolicy: the storefront BFF reaches it.
module "control" {
  source = "../mesh"

  name                     = "loadgen"
  namespace                = var.namespace
  lang                     = "node"
  image                    = var.image
  container_port           = 8080
  run_as_user              = 1001
  needs_tmp_volume         = true
  replicas                 = var.replicas
  otel_endpoint            = var.otel_endpoint
  otel_resource_attributes = var.otel_resource_attributes

  # CHAOS_ENABLED + MESH_NAMESPACE are only set when chaos is on; the app builds
  # the k8s client (and exposes /chaos/kill) only when CHAOS_ENABLED=1.
  env = merge(
    {
      NODE_ENV    = var.environment
      GATEWAY_URL = var.gateway_url
    },
    var.enable_chaos ? {
      CHAOS_ENABLED  = "1"
      MESH_NAMESPACE = var.namespace
    } : {},
  )

  tags = var.tags
}

#Steady-trickle CronJob — same image, RUN_ON_START fires one bounded run then
#the container exits. Concurrency forbidden so overlapping runs never stack.
resource "kubernetes_cron_job_v1" "trickle" {
  count = var.enable_trickle ? 1 : 0

  metadata {
    name      = "loadgen-trickle"
    namespace = var.namespace
    labels    = local.common_labels
  }

  spec {
    schedule                      = var.trickle_schedule
    concurrency_policy            = "Forbid"
    successful_jobs_history_limit = 1
    failed_jobs_history_limit     = 1
    starting_deadline_seconds     = 60

    job_template {
      metadata {
        labels = local.common_labels
      }
      spec {
        # Bound the Job so a stuck run cannot linger: a little past the run
        # duration. backoff 0 — a failed trickle is not worth retrying.
        active_deadline_seconds = var.trickle_duration_seconds + 60
        backoff_limit           = 0

        template {
          metadata {
            labels = local.common_labels
          }
          spec {
            restart_policy = "Never"

            security_context {
              run_as_non_root = true
              run_as_user     = 1001
              run_as_group    = 1001
              fs_group        = 1001
              seccomp_profile {
                type = "RuntimeDefault"
              }
            }

            container {
              name  = "loadgen-trickle"
              image = var.image

              security_context {
                allow_privilege_escalation = false
                read_only_root_filesystem  = true
                capabilities {
                  drop = ["ALL"]
                }
              }

              env {
                name  = "GATEWAY_URL"
                value = var.gateway_url
              }
              env {
                name  = "RUN_ON_START"
                value = var.trickle_scenario
              }
              env {
                name  = "RUN_RPS"
                value = tostring(var.trickle_rps)
              }
              env {
                name  = "RUN_DURATION_SECONDS"
                value = tostring(var.trickle_duration_seconds)
              }
              env {
                name  = "OTEL_EXPORTER_OTLP_ENDPOINT"
                value = var.otel_endpoint
              }
              env {
                name  = "OTEL_SERVICE_NAME"
                value = "loadgen-trickle"
              }
            }
          }
        }
      }
    }
  }
}
