# Plans the observability module against mocked providers and checks the
# otel-agent that collects containers' stdout. On the 2026-11-05 EKS run the
# services that log only to stdout (pricing, ledger, inventory) had no logs in
# Loki at all, so an agent querying Loki found nothing for them.
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
  acm_cert_arn      = ""
  domain            = "example.com"
}

run "no_agent_without_namespaces" {
  command = plan

  assert {
    condition     = length(helm_release.otel_agent) == 0
    error_message = "Without log_collection_namespaces no agent runs."
  }
}

run "the_agent_reads_the_namespace_but_not_the_otlp_services" {
  command = plan

  variables {
    log_collection_namespaces     = ["cloudops"]
    log_collection_skip_workloads = ["api-gateway", "payment"]
  }

  assert {
    condition     = yamldecode(helm_release.otel_agent[0].values[0]).mode == "daemonset"
    error_message = "Reading /var/log/pods needs one collector per node."
  }

  assert {
    condition     = yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.include == ["/var/log/pods/cloudops_*/*/*.log"]
    error_message = "The agent must read only the listed namespaces' pods."
  }

  # Their logs already arrive over OTLP; their stdout would be each line twice.
  assert {
    condition = (
      contains(yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.exclude, "/var/log/pods/cloudops_api-gateway-*/*/*.log") &&
      contains(yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.exclude, "/var/log/pods/cloudops_payment-*/*/*.log")
    )
    error_message = "Workloads that export OTLP logs must be excluded."
  }

  # The gateway refuses OTLP without the token, and is where Loki and the
  # Argus mirror are fed from. Over HTTP: gRPC will not send a bearer token
  # on a plaintext connection, and the agent crashlooped on it under kind.
  assert {
    condition = (
      yamldecode(helm_release.otel_agent[0].values[0]).config.exporters["otlphttp/gateway"].endpoint == "http://opentelemetry-collector.monitoring.svc:4318" &&
      yamldecode(helm_release.otel_agent[0].values[0]).config.exporters["otlphttp/gateway"].auth.authenticator == "bearertokenauth"
    )
    error_message = "The agent must send to the gateway collector with the bearer token."
  }

  assert {
    condition = (
      yamldecode(helm_release.otel_agent[0].values[0]).config.service.pipelines.traces == null &&
      yamldecode(helm_release.otel_agent[0].values[0]).config.service.pipelines.metrics == null &&
      contains(yamldecode(helm_release.otel_agent[0].values[0]).config.service.pipelines.logs.processors, "transform/service-name")
    )
    error_message = "The agent carries logs only, and names each line after its workload."
  }

  assert {
    condition     = contains(yamldecode(helm_release.otel_agent[0].values[0]).config.service.extensions, "health_check")
    error_message = "The chart refuses to install without health_check in the extensions."
  }
}

# From the end of each file, lines written before the agent started were
# lost; from the beginning without checkpoints, a restart would send every
# line again.
run "the_agent_reads_from_the_start_and_keeps_its_place" {
  command = plan

  variables {
    log_collection_namespaces = ["cloudops"]
  }

  assert {
    condition = (
      yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.start_at == "beginning" &&
      yamldecode(helm_release.otel_agent[0].values[0]).presets.logsCollection.storeCheckpoints
    )
    error_message = "The agent must start at the beginning of each file and store checkpoints."
  }
}

# The mesh services log JSON with level and trace IDs; without these
# operators the lines reach Loki with no severity and no trace context
# (Argus LOG-002 and ARG-LOG-001 on the EKS runs).
run "the_agent_parses_level_and_trace_context" {
  command = plan

  variables {
    log_collection_namespaces = ["cloudops"]
  }

  assert {
    condition = (
      yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.operators[0].type == "container" &&
      anytrue([for o in yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.operators : o.type == "json_parser" && try(o.severity.parse_from, "") == "attributes.level"]) &&
      anytrue([for o in yamldecode(helm_release.otel_agent[0].values[0]).config.receivers.filelog.operators : o.type == "trace_parser" && try(o.trace_id.parse_from, "") == "attributes.trace_id"])
    )
    error_message = "The agent must keep the container parser first, then set severity from level and trace context from trace_id/span_id."
  }
}
