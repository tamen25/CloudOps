# Plans the observability module against mocked providers and checks the
# OTel Collector release: the chart has no default image and refuses to
# render without one, and this config needs the contrib distribution.
#
#   cd modules/observability && terraform init -backend=false && terraform test

mock_provider "aws" {}
mock_provider "helm" {}
mock_provider "kubernetes" {}
mock_provider "random" {}
mock_provider "null" {}

variables {
  name_prefix       = "cloudops-dev"
  environment       = "dev"
  region            = "us-east-1"
  aws_account_id    = "123456789012"
  eks_cluster_name  = "cloudops-dev-cluster"
  oidc_provider_arn = "arn:aws:iam::123456789012:oidc-provider/oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
  oidc_provider_url = "oidc.eks.us-east-1.amazonaws.com/id/EXAMPLE"
  acm_cert_arn      = "arn:aws:acm:us-east-1:123456789012:certificate/example"
  domain            = "example.com"
}

run "the_collector_runs_the_contrib_image" {
  command = plan

  # bearertokenauth and the loki exporter exist only in contrib.
  assert {
    condition     = yamldecode(helm_release.otel_collector.values[0]).image.repository == "otel/opentelemetry-collector-contrib"
    error_message = "The collector must set image.repository to the contrib distribution; the chart has no default."
  }
}

# With an Argus address, every signal is mirrored to the engine as well as
# to its backend; without one, nothing is.
run "every_pipeline_mirrors_to_argus_when_asked" {
  command = plan

  variables {
    argus_otlp_endpoint = "argus.argus.svc:4317"
  }

  assert {
    condition     = yamldecode(helm_release.otel_collector.values[0]).config.exporters["otlp/argus"].endpoint == "argus.argus.svc:4317"
    error_message = "The otlp/argus exporter must point at the engine."
  }

  assert {
    condition = alltrue([
      for p in ["traces", "metrics", "logs"] :
      contains(yamldecode(helm_release.otel_collector.values[0]).config.service.pipelines[p].exporters, "otlp/argus")
    ])
    error_message = "Traces, metrics and logs must all be mirrored."
  }

  # The engine is never in the critical path: the backends stay first.
  assert {
    condition     = yamldecode(helm_release.otel_collector.values[0]).config.service.pipelines.traces.exporters[0] == "otlphttp/tempo"
    error_message = "Tempo must stay an exporter of the traces pipeline."
  }
}

run "no_mirror_without_an_argus_address" {
  command = plan

  assert {
    condition     = !contains(keys(yamldecode(helm_release.otel_collector.values[0]).config.exporters), "otlp/argus")
    error_message = "With argus_otlp_endpoint empty there must be no Argus exporter."
  }
}

# In-cluster workloads reach the collector through its Service, which needs
# neither the ingress module nor DNS.
run "the_internal_endpoint_is_the_collector_service" {
  command = plan

  assert {
    condition     = output.otel_internal_endpoint == "http://opentelemetry-collector.monitoring.svc:4318"
    error_message = "otel_internal_endpoint must be the collector's in-cluster OTLP/HTTP address."
  }
}
