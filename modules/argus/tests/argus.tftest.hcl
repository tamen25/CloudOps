# Plans the argus module against mocked providers. The engine's OTLP
# receiver has no authentication, so its NetworkPolicy is what decides who
# can report telemetry and so move the scores.
#
#   cd modules/argus && terraform init -backend=false && terraform test

mock_provider "helm" {}
mock_provider "kubernetes" {}

variables {
  chart = "../../../Argus/deploy/helm/argus"
}

run "only_the_monitoring_namespace_reaches_the_engine" {
  command = plan

  assert {
    condition     = yamldecode(helm_release.argus.values[0]).networkPolicy.otlpAllowedNamespaces == ["monitoring"]
    error_message = "Only the collector's namespace may send OTLP to the engine."
  }

  assert {
    condition     = yamldecode(helm_release.argus.values[0]).networkPolicy.enabled == true
    error_message = "The engine's NetworkPolicy must be on: the receiver has no authentication."
  }
}

# kube-prometheus-stack selects ServiceMonitors by its release label; without
# it the score gauges are never scraped.
run "prometheus_scrapes_the_score_gauges" {
  command = plan

  assert {
    condition     = yamldecode(helm_release.argus.values[0]).serviceMonitor.enabled == true
    error_message = "The ServiceMonitor must be on."
  }

  assert {
    condition     = yamldecode(helm_release.argus.values[0]).serviceMonitor.labels.release == "prometheus"
    error_message = "The ServiceMonitor must carry release=prometheus."
  }
}

run "an_empty_chart_path_is_refused" {
  command = plan

  variables {
    chart = ""
  }

  expect_failures = [var.chart]
}
