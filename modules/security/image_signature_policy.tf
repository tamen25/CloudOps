# Image signature admission: Sigstore policy-controller (BACKLOG D02).
#
# It replaces the cosign-gatekeeper-provider and its Gatekeeper constraint.
# That provider was archived in December 2025 and built on cosign v1.13
# (2022); it was never switched on (no stack passed its variables).
#
# What is checked: images from this project's order-api ECR repository must
# carry a keyless cosign signature made by this repository's app.yml on
# main (the only workflow that signs). Images no policy covers are admitted:
# the mesh images are built locally and unsigned (scripts/build-and-push.sh).
#
# Rollout: install with mode "warn" (violations are reported, pods admitted),
# check the warnings for a deploy or two, then "enforce".
# docs/runbooks/image-signature-policy.md.
#
# Like the Gatekeeper constraints, the ClusterImagePolicy needs the chart's
# CRD to exist when it is planned: on a fresh cluster, apply once with the
# release, then again for the policy.

locals {
  image_signature_namespace = "cosign-system"
  order_api_image_glob      = "${var.aws_account_id}.dkr.ecr.${var.region}.amazonaws.com/${var.project_name}/order-api**"
}

resource "helm_release" "policy_controller" {
  count = var.enable_image_signature_policy ? 1 : 0

  name             = "policy-controller"
  repository       = "https://sigstore.github.io/helm-charts"
  chart            = "policy-controller"
  version          = "0.10.8"
  namespace        = local.image_signature_namespace
  create_namespace = true
  timeout          = 300

  values = [yamlencode({
    webhook = {
      # Two replicas: the webhook's failure policy is Fail and the chart's
      # PodDisruptionBudget keeps one available, so a single replica would
      # block pod creation while it restarts and every node drain.
      replicaCount = 2
      configData = {
        # Without this, an image no ClusterImagePolicy matches is refused in
        # every opted-in namespace, the unsigned mesh images included.
        "no-match-policy" = "allow"
      }
    }
  })]
}

resource "kubernetes_manifest" "order_api_signature_policy" {
  count = var.enable_image_signature_policy ? 1 : 0

  manifest = {
    apiVersion = "policy.sigstore.dev/v1beta1"
    kind       = "ClusterImagePolicy"
    metadata   = { name = "order-api-signed-by-ci" }
    spec = {
      mode   = var.image_signature_policy_mode
      images = [{ glob = local.order_api_image_glob }]
      authorities = [{
        keyless = {
          url = "https://fulcio.sigstore.dev"
          identities = [{
            issuer        = "https://token.actions.githubusercontent.com"
            subjectRegExp = "^https://github\\.com/${replace(var.github_repo, ".", "\\.")}/\\.github/workflows/app\\.yml@refs/heads/main$"
          }]
        }
        ctlog = { url = "https://rekor.sigstore.dev" }
      }]
    }
  }

  depends_on = [helm_release.policy_controller]
}

# policy-controller acts only in namespaces carrying this label.
resource "kubernetes_labels" "image_signature_opt_in" {
  count = var.enable_image_signature_policy ? 1 : 0

  api_version = "v1"
  kind        = "Namespace"
  metadata {
    name = var.application_namespace
  }
  labels = {
    "policy.sigstore.dev/include" = "true"
  }

  depends_on = [helm_release.policy_controller]
}
