# Plans the observability module against mocked providers and checks the
# two things that stopped the platform stack's first plan on a new cluster.
#
# PrometheusRules: a kubernetes_manifest needs its CRD when it is planned,
# and kube-prometheus-stack installs that CRD in the same apply, so the
# rules must ride on the chart (additionalPrometheusRulesMap).
#
# Ingresses: Grafana's and the collector's need the ingress module's
# certificate; with ingress off there must be none, so observability can run
# without it.
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

run "the_rules_ride_on_the_prometheus_chart" {
  command = plan

  assert {
    condition = alltrue([
      for rule in ["order-api-slo-availability", "order-api-slo-latency", "order-api-slo-throughput", "order-api-jwks-reachability"] :
      contains(keys(yamldecode(helm_release.prometheus.values[0]).additionalPrometheusRulesMap), rule)
    ])
    error_message = "The SLO and JWKS rules must be in kube-prometheus-stack's additionalPrometheusRulesMap, not separate PrometheusRule manifests."
  }

  assert {
    condition     = length(yamldecode(helm_release.prometheus.values[0]).additionalPrometheusRulesMap["order-api-slo-availability"].groups) > 0
    error_message = "The availability rule must carry its rule groups."
  }
}

run "ingresses_exist_with_a_certificate" {
  command = plan

  assert {
    condition     = length(kubernetes_ingress_v1.otel_http) == 1 && length(kubernetes_ingress_v1.otel_grpc) == 1
    error_message = "With the ingress module's certificate, the collector keeps its HTTP and gRPC ingresses."
  }

  assert {
    condition     = yamldecode(helm_release.grafana.values[0]).ingress.enabled
    error_message = "With a certificate, Grafana keeps its ingress."
  }

  assert {
    condition     = length(null_resource.grafana_service_account) == 1
    error_message = "With Grafana's public URL, the Lambda reader's service account is still created."
  }
}

run "no_ingresses_without_a_certificate" {
  command = plan

  variables {
    acm_cert_arn = ""
  }

  assert {
    condition     = length(kubernetes_ingress_v1.otel_http) == 0 && length(kubernetes_ingress_v1.otel_grpc) == 0
    error_message = "With ingress off, the collector must get no ALB ingress (it would carry an empty certificate)."
  }

  assert {
    condition     = !yamldecode(helm_release.grafana.values[0]).ingress.enabled
    error_message = "With ingress off, Grafana must get no ALB ingress."
  }

  # It waits for https://grafana.<domain>, which does not exist without the
  # ingress, and failed the apply after six minutes.
  assert {
    condition     = length(null_resource.grafana_service_account) == 0
    error_message = "Without an ingress, nothing may wait for Grafana's public URL."
  }
}

# Each of these made a component refuse to start (or never schedule) on the
# first real apply; the charts validate their config only at runtime.
run "loki_and_mimir_configs_start" {
  command = plan

  variables {
    metrics_long_term_storage = "mimir"
  }

  # The values embed the buckets' and roles' identifiers, unknown at plan
  # under a mock unless given.
  override_resource {
    target          = aws_s3_bucket.loki
    override_during = plan
    values          = { id = "cloudops-dev-loki" }
  }
  override_resource {
    target          = aws_iam_role.loki
    override_during = plan
    values          = { arn = "arn:aws:iam::123456789012:role/loki" }
  }
  override_resource {
    target          = aws_s3_bucket.mimir
    override_during = plan
    values          = { id = "cloudops-dev-mimir" }
  }
  override_resource {
    target          = aws_iam_role.mimir
    override_during = plan
    values          = { arn = "arn:aws:iam::123456789012:role/mimir" }
  }

  assert {
    condition     = yamldecode(helm_release.loki.values[0]).loki.schemaConfig.configs[0].schema == "v13"
    error_message = "Loki 3 refuses schema v12 while structured metadata is on."
  }

  assert {
    condition     = yamldecode(helm_release.loki.values[0]).loki.compactor.delete_request_store != ""
    error_message = "Loki with retention needs a delete_request_store."
  }

  assert {
    condition     = yamldecode(helm_release.loki.values[0]).chunksCache.allocatedMemory <= 1024
    error_message = "The chunk cache must fit on a t3.large (the chart default asks for ~9.8 GiB)."
  }

  assert {
    condition = (
      yamldecode(helm_release.mimir[0].values[0]).mimir.structuredConfig.ruler_storage.storage_prefix != "" &&
      yamldecode(helm_release.mimir[0].values[0]).mimir.structuredConfig.alertmanager_storage.storage_prefix != "" &&
      yamldecode(helm_release.mimir[0].values[0]).mimir.structuredConfig.ruler_storage.storage_prefix != yamldecode(helm_release.mimir[0].values[0]).mimir.structuredConfig.alertmanager_storage.storage_prefix
    )
    error_message = "Mimir's ruler and Alertmanager need their own prefixes in the shared bucket."
  }
}

# The chart refuses to install (its NOTES.txt fails) unless health_check is
# in the service's extensions; `helm template` does not render NOTES.txt, so
# only an install shows it.
run "the_collector_keeps_the_health_check_extension" {
  command = plan

  assert {
    condition     = contains(yamldecode(helm_release.otel_collector.values[0]).config.service.extensions, "health_check")
    error_message = "The collector's service.extensions must include health_check."
  }
}

# The contrib loki exporter refuses its `labels` block from 0.104 (the
# collector crashlooped on it); logs go to Loki's OTLP endpoint instead.
run "logs_go_to_loki_over_otlp" {
  command = plan

  assert {
    condition     = !contains(keys(yamldecode(helm_release.otel_collector.values[0]).config.exporters), "loki")
    error_message = "The deprecated loki exporter must not be configured."
  }

  assert {
    condition     = yamldecode(helm_release.otel_collector.values[0]).config.exporters["otlphttp/loki"].endpoint == "http://loki-gateway.loki.svc/otlp"
    error_message = "Logs must go to the Loki gateway's OTLP endpoint."
  }

  assert {
    condition     = contains(yamldecode(helm_release.otel_collector.values[0]).config.service.pipelines.logs.exporters, "otlphttp/loki")
    error_message = "The logs pipeline must use the OTLP exporter."
  }
}

# The collector refuses a batch max below the batch size, whose default
# (8192) is above the max this module sets; found by `otelcol-contrib
# validate` on the rendered config.
run "the_batch_limits_are_consistent" {
  command = plan

  assert {
    condition = (
      try(yamldecode(helm_release.otel_collector.values[0]).config.processors.batch.send_batch_size, 8192) <=
      yamldecode(helm_release.otel_collector.values[0]).config.processors.batch.send_batch_max_size
    )
    error_message = "send_batch_max_size must be at least send_batch_size (default 8192)."
  }
}

# The output named mimir-gateway, a Service the 5.x chart does not create
# (its entry point is mimir-nginx); found querying Mimir on EKS.
run "the_mimir_url_names_a_service_that_exists" {
  command = plan

  variables {
    metrics_long_term_storage = "mimir"
  }

  assert {
    condition     = output.mimir_url == "http://mimir-nginx.mimir.svc"
    error_message = "mimir_url must name the chart's nginx entry point."
  }
}

# fraud's Java agent sends its exporter counters without a unit (Argus
# MET-002 on the EKS run); the metrics pipeline gives them {item}.
run "unitless_sdk_counters_get_a_unit" {
  command = plan

  assert {
    condition = (
      contains(yamldecode(helm_release.otel_collector.values[0]).config.service.pipelines.metrics.processors, "transform/sdk-units") &&
      strcontains(yamldecode(helm_release.otel_collector.values[0]).config.processors["transform/sdk-units"].metric_statements[0].statements[0], "otlp.exporter.seen")
    )
    error_message = "The metrics pipeline must set a unit on the Java agent's unitless exporter counters."
  }
}
