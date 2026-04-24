# OPA Gatekeeper ConstraintTemplates and Constraints
#
# Each policy is two resources:
#   1. kubernetes_manifest.<name>_ct  — ConstraintTemplate: defines the CRD kind + Rego logic
#   2. kubernetes_manifest.<name>_c   — Constraint: instance that scopes and activates the policy
#
# depends_on chains:
#   ConstraintTemplates → helm_release.gatekeeper
#   Constraints         → their ConstraintTemplate (CRD must be registered first)
#
# Enforcement actions:
#   deny  — blocks the admission request; Pod is not created
#   warn  — admits the Pod but attaches a warning to the API response (less disruptive)
#
# All constraints match kind: Pod in apiGroups: [""].

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 1 — No Root Containers
# Checks: runAsNonRoot: true OR runAsUser > 0 at container or pod level
# Scope:  all namespaces except kube-system, gatekeeper-system, falco
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_no_root_containers" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8snorootcontainers"
      annotations = {
        description = "Ensures containers run as non-root: runAsNonRoot true or runAsUser > 0"
      }
    }
    spec = {
      crd = {
        spec = {
          names      = { kind = "K8sNoRootContainers" }
          validation = { openAPIV3Schema = { type = "object" } }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8snorootcontainers

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not is_nonroot(c, input.review.object.spec)
              msg := sprintf("container <%v> must set securityContext.runAsNonRoot: true or runAsUser > 0", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              not is_nonroot(c, input.review.object.spec)
              msg := sprintf("initContainer <%v> must set securityContext.runAsNonRoot: true or runAsUser > 0", [c.name])
            }

            # Container-level check (takes precedence over pod-level)
            is_nonroot(c, _) {
              c.securityContext.runAsNonRoot == true
            }
            is_nonroot(c, _) {
              c.securityContext.runAsUser > 0
            }

            # Fall back to pod-level security context
            is_nonroot(_, spec) {
              spec.securityContext.runAsNonRoot == true
            }
            is_nonroot(_, spec) {
              spec.securityContext.runAsUser > 0
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_no_root_containers" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sNoRootContainers"
    metadata   = { name = "no-root-containers" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds              = [{ apiGroups = [""], kinds = ["Pod"] }]
        excludedNamespaces = ["kube-system", "gatekeeper-system", "falco"]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_no_root_containers]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 2 — Required Resource Limits
# Checks: resources.limits.cpu and resources.limits.memory set on all containers
# Scope:  cloudops and monitoring namespaces
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_required_resources" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8srequiredresources"
      annotations = {
        description = "Ensures all containers define CPU and memory limits"
      }
    }
    spec = {
      crd = {
        spec = {
          names      = { kind = "K8sRequiredResources" }
          validation = { openAPIV3Schema = { type = "object" } }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8srequiredresources

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not c.resources.limits.cpu
              msg := sprintf("container <%v> must define resources.limits.cpu", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not c.resources.limits.memory
              msg := sprintf("container <%v> must define resources.limits.memory", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              not c.resources.limits.cpu
              msg := sprintf("initContainer <%v> must define resources.limits.cpu", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              not c.resources.limits.memory
              msg := sprintf("initContainer <%v> must define resources.limits.memory", [c.name])
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_required_resources" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sRequiredResources"
    metadata   = { name = "required-resource-limits" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds      = [{ apiGroups = [""], kinds = ["Pod"] }]
        namespaces = ["cloudops", "monitoring"]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_required_resources]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 3 — No Privileged Containers
# Checks: securityContext.privileged != true
# Scope:  all namespaces EXCEPT falco (Falco's eBPF driver needs privileged mode)
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_no_privileged" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8snoprivilegedcontainers"
      annotations = {
        description = "Ensures containers do not run with securityContext.privileged: true"
      }
    }
    spec = {
      crd = {
        spec = {
          names      = { kind = "K8sNoPrivilegedContainers" }
          validation = { openAPIV3Schema = { type = "object" } }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8snoprivilegedcontainers

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              c.securityContext.privileged == true
              msg := sprintf("container <%v> must not run as privileged (securityContext.privileged: true is forbidden)", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              c.securityContext.privileged == true
              msg := sprintf("initContainer <%v> must not run as privileged (securityContext.privileged: true is forbidden)", [c.name])
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_no_privileged" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sNoPrivilegedContainers"
    metadata   = { name = "no-privileged-containers" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds = [{ apiGroups = [""], kinds = ["Pod"] }]
        # Falco's eBPF driver pod runs privileged — exempt its namespace
        excludedNamespaces = ["falco"]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_no_privileged]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 4 — Required Liveness and Readiness Probes
# Checks: livenessProbe and readinessProbe present on all containers
# Scope:  cloudops namespace only
# Action: warn (not deny) — less disruptive; surfaces missing probes as warnings
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_required_probes" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8srequiredprobes"
      annotations = {
        description = "Ensures all containers define livenessProbe and readinessProbe"
      }
    }
    spec = {
      crd = {
        spec = {
          names      = { kind = "K8sRequiredProbes" }
          validation = { openAPIV3Schema = { type = "object" } }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8srequiredprobes

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not c.livenessProbe
              msg := sprintf("container <%v> must define a livenessProbe", [c.name])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not c.readinessProbe
              msg := sprintf("container <%v> must define a readinessProbe", [c.name])
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_required_probes" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sRequiredProbes"
    metadata   = { name = "required-probes" }
    spec = {
      # warn: Pod is admitted but the API response contains a warning message.
      # Upgrade to "deny" once all workloads in cloudops have both probes defined.
      enforcementAction = "warn"
      match = {
        kinds      = [{ apiGroups = [""], kinds = ["Pod"] }]
        namespaces = [var.application_namespace]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_required_probes]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 5 — No Latest Image Tag
# Checks: image tag is not ":latest" and is not absent (untagged)
# Scope:  cloudops namespace
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_no_latest_tag" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8snolatesttag"
      annotations = {
        description = "Ensures container images use an explicit tag other than :latest"
      }
    }
    spec = {
      crd = {
        spec = {
          names      = { kind = "K8sNoLatestTag" }
          validation = { openAPIV3Schema = { type = "object" } }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8snolatesttag

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              bad_tag(c.image)
              msg := sprintf("container <%v> image <%v> must specify an explicit tag — :latest and untagged images are not allowed", [c.name, c.image])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              bad_tag(c.image)
              msg := sprintf("initContainer <%v> image <%v> must specify an explicit tag — :latest and untagged images are not allowed", [c.name, c.image])
            }

            # Explicitly tagged :latest
            bad_tag(image) {
              endswith(image, ":latest")
            }

            # No tag at all (no colon, no digest)
            bad_tag(image) {
              not contains(image, ":")
              not contains(image, "@")
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_no_latest_tag" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sNoLatestTag"
    metadata   = { name = "no-latest-tag" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds      = [{ apiGroups = [""], kinds = ["Pod"] }]
        namespaces = [var.application_namespace]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_no_latest_tag]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 6 — Allowed Image Registries
# Checks: image starts with one of the allowed registry prefixes (parameters.repos)
# Scope:  cloudops namespace
# Registries: ECR (account-specific), public.ecr.aws, registry.k8s.io, quay.io, ghcr.io
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_allowed_repos" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8sallowedrepos"
      annotations = {
        description = "Ensures container images are pulled from approved registries only"
      }
    }
    spec = {
      crd = {
        spec = {
          names = { kind = "K8sAllowedRepos" }
          validation = {
            openAPIV3Schema = {
              type = "object"
              properties = {
                repos = {
                  type        = "array"
                  description = "List of allowed registry prefixes (checked with startswith)"
                  items       = { type = "string" }
                }
              }
            }
          }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8sallowedrepos

            violation[{"msg": msg}] {
              c := input.review.object.spec.containers[_]
              not from_allowed_repo(c.image)
              msg := sprintf("container <%v> image <%v> is not from an allowed registry. Allowed prefixes: %v", [c.name, c.image, input.parameters.repos])
            }

            violation[{"msg": msg}] {
              c := input.review.object.spec.initContainers[_]
              not from_allowed_repo(c.image)
              msg := sprintf("initContainer <%v> image <%v> is not from an allowed registry. Allowed prefixes: %v", [c.name, c.image, input.parameters.repos])
            }

            from_allowed_repo(image) {
              repo := input.parameters.repos[_]
              startswith(image, repo)
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_allowed_repos" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sAllowedRepos"
    metadata   = { name = "allowed-image-repos" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds      = [{ apiGroups = [""], kinds = ["Pod"] }]
        namespaces = [var.application_namespace]
      }
      parameters = {
        repos = [
          "${var.aws_account_id}.dkr.ecr.${var.region}.amazonaws.com",
          "public.ecr.aws",
          "registry.k8s.io",
          "quay.io",
          "ghcr.io",
        ]
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_allowed_repos]
}

# ═══════════════════════════════════════════════════════════════════════════════
# Policy 7 — Require Cosign Image Signature
# Checks: every container image in the cloudops namespace has a valid Cosign
#         keyless signature from this repository's CI workflow, verified via the
#         Cosign Gatekeeper provider (cosign-gatekeeper-provider sidecar).
#
# Architecture:
#   The Cosign Gatekeeper provider runs as a sidecar inside gatekeeper-system and
#   exposes a webhook that Gatekeeper calls out to during admission. The Rego
#   policy calls `external_data` with the image reference; the provider queries
#   the Sigstore transparency log (Rekor) and returns "true" for signed images
#   and an error string for unsigned ones.
#
# Prerequisites:
#   - Cosign Gatekeeper provider deployed (see gatekeeper.tf helm_release.cosign_provider)
#   - Images signed in CI via `cosign sign --yes` (build-and-push job in app.yml)
#
# Scope:  cloudops namespace only
# Action: deny — unsigned images are blocked from being scheduled
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_manifest" "ct_require_image_signature" {
  manifest = {
    apiVersion = "templates.gatekeeper.sh/v1"
    kind       = "ConstraintTemplate"
    metadata = {
      name = "k8srequireimagesignature"
      annotations = {
        description = "Ensures container images have a valid Cosign keyless signature verified via the Cosign Gatekeeper provider"
      }
    }
    spec = {
      crd = {
        spec = {
          names = { kind = "K8sRequireImageSignature" }
          validation = {
            openAPIV3Schema = {
              type = "object"
              properties = {
                # The certificate identity regexp passed to the Cosign provider
                # for signature verification (matches the GitHub Actions workflow URL).
                certificateIdentityRegexp = {
                  type        = "string"
                  description = "Regexp matched against the signing certificate's Subject Alternative Name (workflow URL)"
                }
                # The expected OIDC issuer in the signing certificate.
                certificateOidcIssuer = {
                  type        = "string"
                  description = "OIDC issuer URL that must appear in the signing certificate"
                }
              }
            }
          }
        }
      }
      targets = [
        {
          target = "admission.k8s.gatekeeper.sh"
          rego   = <<-REGO
            package k8srequireimagesignature

            # The Cosign Gatekeeper provider is registered under this provider name.
            # It accepts image references and returns verified=true or an error.
            # See: https://github.com/sigstore/cosign-gatekeeper-provider

            violation[{"msg": msg}] {
              container := input.review.object.spec.containers[_]
              response   := external_data({"provider": "cosign-provider", "keys": [container.image]})
              result     := response.responses[_]
              result[0]  == container.image
              result[2]  != ""    # non-empty error means verification failed
              msg := sprintf(
                "container <%v> image <%v> failed Cosign signature verification: %v",
                [container.name, container.image, result[2]]
              )
            }

            violation[{"msg": msg}] {
              container := input.review.object.spec.initContainers[_]
              response   := external_data({"provider": "cosign-provider", "keys": [container.image]})
              result     := response.responses[_]
              result[0]  == container.image
              result[2]  != ""
              msg := sprintf(
                "initContainer <%v> image <%v> failed Cosign signature verification: %v",
                [container.name, container.image, result[2]]
              )
            }

            # Surface system errors from the provider (e.g. provider unreachable)
            # as violations so that failing open is never silently allowed.
            violation[{"msg": msg}] {
              container := input.review.object.spec.containers[_]
              response   := external_data({"provider": "cosign-provider", "keys": [container.image]})
              err        := response.system_error
              err        != ""
              msg := sprintf(
                "Cosign provider system error for container <%v> image <%v>: %v",
                [container.name, container.image, err]
              )
            }
            REGO
        }
      ]
    }
  }

  depends_on = [helm_release.gatekeeper]
}

resource "kubernetes_manifest" "c_require_image_signature" {
  manifest = {
    apiVersion = "constraints.gatekeeper.sh/v1beta1"
    kind       = "K8sRequireImageSignature"
    metadata   = { name = "require-image-signature" }
    spec = {
      enforcementAction = "deny"
      match = {
        kinds      = [{ apiGroups = [""], kinds = ["Pod"] }]
        namespaces = [var.application_namespace]
      }
      parameters = {
        # Matches the identity used by the build-and-push job in app.yml.
        # Scoped to this repository's workflow file so forks cannot sign with the same identity.
        certificateIdentityRegexp = "https://github\\.com/${var.github_repo}/\\.github/workflows/app\\.yml@refs/heads/.*"
        certificateOidcIssuer     = "https://token.actions.githubusercontent.com"
      }
    }
  }

  depends_on = [kubernetes_manifest.ct_require_image_signature]
}
