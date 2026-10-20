# Plans the ci-runner module against mocked providers and checks what the
# runner pods would be admitted with. Gatekeeper's no-root constraint covers
# the ARC namespaces, so a pod spec that drops runAsNonRoot is refused at
# admission, on a live cluster, mid-deploy; this catches it at plan.
#
#   cd modules/ci-runner && terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_secretsmanager_secret_version" {
    defaults = {
      secret_string = "{\"github_app_id\":\"1\",\"github_app_installation_id\":\"2\",\"github_app_private_key\":\"key\"}"
    }
  }
}

mock_provider "helm" {}
mock_provider "kubernetes" {}

variables {
  github_config_url     = "https://github.com/owner/repo"
  github_app_secret_arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:github-app"
  runner_image          = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/ci-runner@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807"
}

run "runner_pods_are_non_root_and_unprivileged" {
  command = plan

  assert {
    condition     = yamldecode(helm_release.runner_set.values[0]).template.spec.securityContext.runAsNonRoot == true
    error_message = "Runner pods must run as non-root: the cluster-wide Gatekeeper constraint refuses them otherwise."
  }

  assert {
    condition     = yamldecode(helm_release.runner_set.values[0]).template.spec.containers[0].securityContext.allowPrivilegeEscalation == false
    error_message = "The runner container must not allow privilege escalation (the runner user is in sudoers)."
  }

  assert {
    condition     = yamldecode(helm_release.runner_set.values[0]).listenerTemplate.spec.securityContext.runAsNonRoot == true
    error_message = "The listener pod must run as non-root."
  }

  assert {
    condition     = yamldecode(helm_release.controller.values[0]).podSecurityContext.runAsNonRoot == true
    error_message = "The controller pod must run as non-root."
  }
}

# Docker-in-Docker needs a privileged container, which Gatekeeper refuses
# outside the falco namespace; deploy jobs need no Docker daemon.
run "no_container_mode" {
  command = plan

  assert {
    condition     = !contains(keys(yamldecode(helm_release.runner_set.values[0])), "containerMode")
    error_message = "containerMode must stay unset: dind needs a privileged container."
  }
}

# A runner pod runs a job's code. Outside DNS and HTTPS it must reach
# nothing, so a job cannot talk to Postgres or Grafana inside the cluster.
run "runner_egress_is_dns_and_https_only" {
  command = plan

  assert {
    condition     = toset(kubernetes_network_policy.runners.spec[0].policy_types) == toset(["Ingress", "Egress"])
    error_message = "The runner policy must govern both directions (no ingress rule means deny all)."
  }

  assert {
    condition     = length(kubernetes_network_policy.runners.spec[0].ingress) == 0
    error_message = "Nothing may connect to a runner pod."
  }

  assert {
    condition     = toset(flatten([for e in kubernetes_network_policy.runners.spec[0].egress : [for p in e.ports : p.port]])) == toset(["53", "443"])
    error_message = "Runner egress must be limited to DNS and HTTPS."
  }
}

run "the_runner_set_scales_to_zero" {
  command = plan

  assert {
    condition     = yamldecode(helm_release.runner_set.values[0]).minRunners == 0
    error_message = "No runner pod should idle between jobs."
  }

  assert {
    condition     = output.runner_set_name == "cloudops-vpc"
    error_message = "The default runner set name is what DEPLOY_RUNNER is documented to hold."
  }
}

run "a_tagged_runner_image_is_refused" {
  command = plan

  variables {
    runner_image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/ci-runner:2.338.0"
  }

  expect_failures = [var.runner_image]
}

run "a_non_github_config_url_is_refused" {
  command = plan

  variables {
    github_config_url = "https://example.com/owner/repo"
  }

  expect_failures = [var.github_config_url]
}
