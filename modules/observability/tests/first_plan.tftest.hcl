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
}
