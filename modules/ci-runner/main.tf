# Self-hosted GitHub Actions runners inside the VPC (ADR 025): Actions Runner
# Controller on the platform cluster, one ephemeral runner pod per job.
#
# Why: with a private EKS endpoint (the prod shape, ADR 013), GitHub-hosted
# runners cannot reach the cluster API, so jobs that run kubectl or plan the
# platform stack cannot run. These runners sit in the cluster, inside the VPC.
#
# AWS credentials: none here. A job on these runners still assumes its role
# through GitHub's OIDC token (configure-aws-credentials), exactly as on a
# hosted runner, so the pods need no IRSA role.
#
# GitHub credentials: the runner set registers as a GitHub App. Its id,
# installation id and private key are a JSON secret in Secrets Manager
# (github_app_secret_arn), copied into a Kubernetes Secret here. The copy is
# also in Terraform state, which is encrypted in the state bucket.
#
# Workflows choose these runners through the DEPLOY_RUNNER repository
# variable (runs-on: ${{ vars.DEPLOY_RUNNER || 'ubuntu-latest' }}); unset,
# every job stays on GitHub-hosted runners.

locals {
  controller_namespace = "arc-systems"
  runner_namespace     = "arc-runners"
  chart_repository     = "oci://ghcr.io/actions/actions-runner-controller-charts"
}

data "aws_secretsmanager_secret_version" "github_app" {
  secret_id = var.github_app_secret_arn
}

locals {
  github_app = jsondecode(data.aws_secretsmanager_secret_version.github_app.secret_string)
}

resource "kubernetes_namespace" "controller" {
  metadata {
    name = local.controller_namespace
  }
}

resource "kubernetes_namespace" "runners" {
  metadata {
    name = local.runner_namespace
  }
}

# Runner pods execute whatever a workflow asks, so they get the network a
# deploy job needs and nothing more: DNS, and HTTPS to GitHub, the AWS APIs
# and the EKS endpoint. In-cluster services (Postgres, Grafana, Mimir) are
# out of reach, and nothing may connect in. VPC CNI enforces this (ADR 012).
resource "kubernetes_network_policy" "runners" {
  metadata {
    name      = "runners-egress-https-only"
    namespace = kubernetes_namespace.runners.metadata[0].name
  }

  spec {
    pod_selector {}
    policy_types = ["Ingress", "Egress"]

    egress {
      to {
        namespace_selector {
          match_labels = { "kubernetes.io/metadata.name" = "kube-system" }
        }
      }
      ports {
        protocol = "UDP"
        port     = "53"
      }
      ports {
        protocol = "TCP"
        port     = "53"
      }
    }

    egress {
      to {
        ip_block {
          cidr = "0.0.0.0/0"
        }
      }
      ports {
        protocol = "TCP"
        port     = "443"
      }
    }
  }
}

resource "kubernetes_secret" "github_app" {
  metadata {
    name      = "github-app"
    namespace = kubernetes_namespace.runners.metadata[0].name
  }
  data = {
    github_app_id              = local.github_app["github_app_id"]
    github_app_installation_id = local.github_app["github_app_installation_id"]
    github_app_private_key     = local.github_app["github_app_private_key"]
  }
}

# The controller and the listener it starts run as non-root: Gatekeeper's
# cluster-wide no-root constraint applies to their namespace.
resource "helm_release" "controller" {
  name       = "arc"
  repository = local.chart_repository
  chart      = "gha-runner-scale-set-controller"
  version    = var.chart_version
  namespace  = kubernetes_namespace.controller.metadata[0].name
  timeout    = 300

  values = [yamlencode({
    podSecurityContext = { runAsNonRoot = true, runAsUser = 1000 }
    securityContext = {
      allowPrivilegeEscalation = false
      readOnlyRootFilesystem   = true
      capabilities             = { drop = ["ALL"] }
    }
  })]
}

resource "helm_release" "runner_set" {
  name       = var.runner_set_name
  repository = local.chart_repository
  chart      = "gha-runner-scale-set"
  version    = var.chart_version
  namespace  = kubernetes_namespace.runners.metadata[0].name
  timeout    = 300

  values = [yamlencode({
    githubConfigUrl    = var.github_config_url
    githubConfigSecret = kubernetes_secret.github_app.metadata[0].name
    minRunners         = 0
    maxRunners         = var.max_runners
    controllerServiceAccount = {
      namespace = kubernetes_namespace.controller.metadata[0].name
      name      = "arc-gha-rs-controller"
    }
    listenerTemplate = {
      spec = {
        securityContext = { runAsNonRoot = true, runAsUser = 1000 }
        containers      = [{ name = "listener" }]
      }
    }
    # No container mode: jobs run directly in the runner container. Image
    # builds stay on hosted runners; these jobs only deploy, which needs no
    # Docker daemon (and no privileged dind container).
    template = {
      spec = {
        securityContext = { runAsNonRoot = true, runAsUser = 1001, fsGroup = 123 }
        containers = [{
          name    = "runner"
          image   = var.runner_image
          command = ["/home/runner/run.sh"]
          securityContext = {
            allowPrivilegeEscalation = false
            capabilities             = { drop = ["ALL"] }
          }
          resources = {
            requests = { cpu = "250m", memory = "512Mi" }
            limits   = { cpu = "2", memory = "4Gi" }
          }
        }]
      }
    }
  })]

  depends_on = [helm_release.controller]
}
