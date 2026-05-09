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
