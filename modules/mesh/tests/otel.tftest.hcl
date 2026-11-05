# Plans the mesh module against a mocked Kubernetes provider and checks how
# each service authenticates to the OTel Collector, which refuses OTLP
# without the bearer token.
#
#   cd modules/mesh && terraform init -backend=false && terraform test

mock_provider "kubernetes" {}

variables {
  name          = "fraud"
  namespace     = "cloudops"
  image         = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/fraud@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807"
  otel_endpoint = "http://opentelemetry-collector.monitoring.svc:4318"
}

# The OTel Java agent takes headers only from OTEL_EXPORTER_OTLP_HEADERS; a
# Java service without it has all its telemetry refused.
run "a_java_service_sends_the_token_as_an_otlp_header" {
  command = plan

  variables {
    lang = "java"
  }

  assert {
    condition = contains(
      [for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.value if e.name == "OTEL_EXPORTER_OTLP_HEADERS"],
      "Authorization=Bearer%20$(OTEL_API_KEY)",
    )
    error_message = "A Java service must carry OTEL_EXPORTER_OTLP_HEADERS with the bearer token."
  }

  # $(OTEL_API_KEY) only expands if OTEL_API_KEY is defined earlier in the list.
  assert {
    condition = (
      index([for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.name], "OTEL_API_KEY")
      < index([for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.name], "OTEL_EXPORTER_OTLP_HEADERS")
    )
    error_message = "OTEL_API_KEY must come before OTEL_EXPORTER_OTLP_HEADERS, or Kubernetes leaves $(OTEL_API_KEY) unexpanded."
  }
}

# The Node, Go and Python services add the header in code; the variable would
# only duplicate it.
run "other_services_leave_the_header_to_their_code" {
  command = plan

  variables {
    lang = "go"
  }

  assert {
    condition     = !contains([for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.name], "OTEL_EXPORTER_OTLP_HEADERS")
    error_message = "Only Java services need OTEL_EXPORTER_OTLP_HEADERS."
  }

  assert {
    condition     = contains([for e in kubernetes_deployment_v1.this.spec[0].template[0].spec[0].container[0].env : e.name], "OTEL_API_KEY")
    error_message = "Every service gets OTEL_API_KEY from the otel-auth Secret."
  }
}
