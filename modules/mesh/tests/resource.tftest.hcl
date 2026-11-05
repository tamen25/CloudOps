# Plans the mesh module against a mocked Kubernetes provider and checks the
# resource attributes. On the 2026-11-05 EKS run Argus found no service.version
# on any mesh service (ARG-RES-002): regressions could not be tied to a
# rollout.
#
#   cd modules/mesh && terraform init -backend=false && terraform test

mock_provider "kubernetes" {}

variables {
  name                     = "pricing"
  namespace                = "cloudops"
  lang                     = "go"
  otel_resource_attributes = "deployment.environment.name=dev"
}

run "a_tagged_image_names_the_version" {
  command = plan

  variables {
    image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/pricing:ee97b67f824c"
  }

  assert {
    condition = contains(
      [for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.value if e.name == "OTEL_RESOURCE_ATTRIBUTES"],
      "deployment.environment.name=dev,service.version=ee97b67f824c",
    )
    error_message = "OTEL_RESOURCE_ATTRIBUTES must keep the caller's attributes and add service.version from the image tag."
  }
}

run "a_digest_image_names_the_digest" {
  command = plan

  variables {
    image = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/pricing@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807"
  }

  assert {
    condition = contains(
      [for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.value if e.name == "OTEL_RESOURCE_ATTRIBUTES"],
      "deployment.environment.name=dev,service.version=4ffadc0002b2",
    )
    error_message = "A digest-only image must give the digest's first 12 hex characters as service.version."
  }
}
