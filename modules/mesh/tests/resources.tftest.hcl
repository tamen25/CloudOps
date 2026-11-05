# Plans the mesh module against a mocked Kubernetes provider and checks the
# default memory sizes. The loadgen control API (Node) was OOM-killed at the
# old 64 MiB default on its first EKS run.
#
#   cd modules/mesh && terraform init -backend=false && terraform test

mock_provider "kubernetes" {}

variables {
  name      = "loadgen"
  namespace = "cloudops"
  image     = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/loadgen@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807"
}

run "a_node_service_gets_room_for_the_runtime" {
  command = plan

  variables {
    lang = "node"
  }

  assert {
    condition     = kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].resources[0].limits["memory"] == "128Mi"
    error_message = "A Node service's default memory limit must be 128Mi; it is OOM-killed under 64Mi."
  }
}

run "other_services_keep_the_small_default" {
  command = plan

  variables {
    lang = "go"
  }

  assert {
    condition     = kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].resources[0].limits["memory"] == "64Mi"
    error_message = "Go and Python services keep the 64Mi default."
  }
}

run "an_explicit_size_wins" {
  command = plan

  variables {
    lang         = "node"
    memory_limit = "256Mi"
  }

  assert {
    condition     = kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].resources[0].limits["memory"] == "256Mi"
    error_message = "A caller's memory_limit must override the default."
  }
}
