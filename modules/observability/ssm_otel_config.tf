#Backlog #61 — publish OTel ingestion config to SSM Parameter Store so
#producer accounts (custom SDK clients, off-cluster shipping pipelines,
#operator scripts) have a single, discoverable contract for endpoint URLs
#and the auth token. This is intentionally a thin distribution layer; we
#do not ship a custom telemetry library.
#
#Path layout (env-scoped so a single account can host multiple envs):
#/cloudops/<env>/otel/endpoint           (String — base host, e.g. https://otel.example.com)
#/cloudops/<env>/otel/endpoint/metrics   (String — full /v1/metrics URL)
#/cloudops/<env>/otel/endpoint/traces    (String — full /v1/traces URL)
#/cloudops/<env>/otel/endpoint/logs      (String — full /v1/logs URL)
#/cloudops/<env>/otel/api-key            (SecureString — same value as the
#cloudops-otel-api-key secret;
#rotates with var.otel_token_rotation_days)
#
#Producer IAM (minimum):
#ssm:GetParameter / ssm:GetParameters on /cloudops/<env>/otel/*
#kms:Decrypt on the AWS-managed alias/aws/ssm key (or a CMK if you
#supply `var.ssm_kms_key_id`)
#
#When `var.publish_otel_ssm_config = false` (default), nothing is created —
#operators opt in once they have producers ready to consume the contract.

locals {
  ssm_otel_base_path = "/${var.name_prefix}/${var.environment}/otel"
}

resource "aws_ssm_parameter" "otel_endpoint" {
  count = var.publish_otel_ssm_config ? 1 : 0

  name        = "${local.ssm_otel_base_path}/endpoint"
  description = "Base OTLP/HTTP endpoint host (no trailing slash, no signal suffix)"
  type        = "String"
  value       = "https://otel.${var.domain}"

  tags = merge(local.common_tags, { Component = "otel-ssm-config" })
}

resource "aws_ssm_parameter" "otel_endpoint_metrics" {
  count = var.publish_otel_ssm_config ? 1 : 0

  name        = "${local.ssm_otel_base_path}/endpoint/metrics"
  description = "Full OTLP/HTTP metrics ingestion URL"
  type        = "String"
  value       = "https://otel.${var.domain}/v1/metrics"

  tags = merge(local.common_tags, { Component = "otel-ssm-config" })
}

resource "aws_ssm_parameter" "otel_endpoint_traces" {
  count = var.publish_otel_ssm_config ? 1 : 0

  name        = "${local.ssm_otel_base_path}/endpoint/traces"
  description = "Full OTLP/HTTP traces ingestion URL"
  type        = "String"
  value       = "https://otel.${var.domain}/v1/traces"

  tags = merge(local.common_tags, { Component = "otel-ssm-config" })
}

resource "aws_ssm_parameter" "otel_endpoint_logs" {
  count = var.publish_otel_ssm_config ? 1 : 0

  name        = "${local.ssm_otel_base_path}/endpoint/logs"
  description = "Full OTLP/HTTP logs ingestion URL"
  type        = "String"
  value       = "https://otel.${var.domain}/v1/logs"

  tags = merge(local.common_tags, { Component = "otel-ssm-config" })
}

#SecureString — encrypted with the AWS-managed KMS alias by default. Pass
#`ssm_kms_key_id` to use a CMK. Value rotates whenever the upstream
#random_password.otel_api_key keepers change (#38).
resource "aws_ssm_parameter" "otel_api_key" {
  count = var.publish_otel_ssm_config ? 1 : 0

  name        = "${local.ssm_otel_base_path}/api-key"
  description = "Bearer token for OTel ingestion. Senders set Authorization: Bearer <value>."
  type        = "SecureString"
  key_id      = var.ssm_kms_key_id != "" ? var.ssm_kms_key_id : null
  value       = random_password.otel_api_key.result

  tags = merge(local.common_tags, { Component = "otel-ssm-config" })
}
