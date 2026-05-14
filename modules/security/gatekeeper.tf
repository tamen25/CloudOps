#This file defines gatekeeper settings for CloudOps.
#OPA Gatekeeper — admission webhook policy enforcement
#Runs as a ValidatingAdmissionWebhook that evaluates Rego policies against
#every incoming Pod create/update request before it reaches etcd.
#
#Requires: enable_eks=true
#
#Two-apply bootstrapping on a fresh cluster:
#1st apply: registers ConstraintTemplate CRDs (Gatekeeper processes them into new CRD kinds)
#2nd apply: creates Constraint instances once those CRD kinds exist in the API server
#
#In CI/CD or a fresh cluster, run:
#terraform apply -target=helm_release.gatekeeper -target=module.security
#then re-run terraform apply to converge the Constraints.

resource "helm_release" "gatekeeper" {
  name             = "gatekeeper"
  repository       = "https://open-policy-agent.github.io/gatekeeper/charts"
  chart            = "gatekeeper"
  version          = "3.17.1"
  namespace        = "gatekeeper-system"
  create_namespace = true

  timeout = 300

  values = [yamlencode({
    #Two controller-manager replicas for HA
    replicas = 2

    #Audit runs every 60 s and reports up to 20 violations per constraint
    auditInterval             = 60
    constraintViolationsLimit = 20

    logLevel = "WARNING"
  })]
}

#Closes backlog #98 — Cosign Gatekeeper provider.
#The K8sRequireImageSignature ConstraintTemplate calls
#`external_data({"provider": "cosign-provider", ...})`. Without this sidecar
#deployed, the constraint reports system errors on every admission and can
#brick the cluster (every Pod create blocked). Hence:
# - `enable_cosign_provider` defaults FALSE (no sidecar, no constraint).
# - When TRUE, Terraform deploys `sigstore/cosign-gatekeeper-provider`.
# - The constraint (in gatekeeper_policies.tf) has its own
#   `enable_image_signature_constraint` toggle so operators can verify the
#   provider is healthy before flipping enforcement on.
#
#Rollout (see docs/runbooks/cosign-gatekeeper.md):
#  1. Set `enable_cosign_provider = true`, apply.
#  2. Confirm sidecar pod healthy in `gatekeeper-system`.
#  3. Confirm CI is signing images with `cosign sign --yes`.
#  4. Audit-mode flip: leave `enable_image_signature_constraint = false`,
#     verify no system errors via Gatekeeper logs.
#  5. Enforce: set `enable_image_signature_constraint = true`, apply.
resource "helm_release" "cosign_provider" {
  count = var.enable_cosign_provider ? 1 : 0

  name       = "cosign-gatekeeper-provider"
  repository = "https://sigstore.github.io/helm-charts"
  chart      = "cosign-gatekeeper-provider"
  version    = "0.2.0"
  namespace  = "gatekeeper-system"

  timeout = 300

  values = [yamlencode({
    providerName = "cosign-provider"
    image = {
      repository = "ghcr.io/sigstore/cosign-gatekeeper-provider"
      pullPolicy = "IfNotPresent"
    }
    resources = {
      requests = { cpu = "50m", memory = "64Mi" }
      limits   = { cpu = "200m", memory = "256Mi" }
    }
  })]

  depends_on = [helm_release.gatekeeper]
}

#Plan-time guard: prevent enabling the constraint without the provider.
#Without this, an operator who flips `enable_image_signature_constraint=true`
#but forgets `enable_cosign_provider=true` will hit `system_error` violations
#on every Pod admission — i.e. the cluster stops accepting workloads.
resource "terraform_data" "cosign_constraint_guard" {
  lifecycle {
    precondition {
      condition     = !var.enable_image_signature_constraint || var.enable_cosign_provider
      error_message = "enable_image_signature_constraint=true requires enable_cosign_provider=true (or an out-of-band cosign-gatekeeper-provider deployment). Without it, every Pod admission will fail with `system_error`."
    }
  }
}
