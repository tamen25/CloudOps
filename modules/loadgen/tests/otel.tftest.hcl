# Plans the loadgen module against a mocked Kubernetes provider. The OTel
# Collector refuses OTLP without the bearer token; the trickle CronJob's
# spans are the roots of the gateway's traces, so losing them leaves every
# gateway span pointing at a parent that never arrives.
#
#   cd modules/loadgen && terraform init -backend=false && terraform test

mock_provider "kubernetes" {}

variables {
  namespace     = "cloudops"
  image         = "123456789012.dkr.ecr.us-east-1.amazonaws.com/cloudops/loadgen@sha256:4ffadc0002b2581327e06101fc8c06cd189232baf79fe561fac9caeb76f5e807"
  gateway_url   = "http://api-gateway.cloudops.svc"
  otel_endpoint = "http://opentelemetry-collector.monitoring.svc:4318"
}

run "the_trickle_sends_the_otel_token" {
  command = plan

  assert {
    condition = contains(
      [for e in kubernetes_cron_job_v1.trickle[0].spec[0].job_template[0].spec[0].template[0].spec[0].container[0].env : e.name],
      "OTEL_API_KEY",
    )
    error_message = "The trickle CronJob must carry OTEL_API_KEY, or the collector refuses its spans."
  }
}
