# OTel ingestion WAF — closes backlog #38.
#
# Independent of the public `cloudops` WAF (which protects api.<domain> +
# grafana.<domain>). gRPC L7 inspection is out of scope, so the rules here
# are just rate-limit + optional CIDR allow-list. Activate by setting either
# var.otel_rate_limit_per_5min > 0 or a non-empty var.otel_allowed_cidrs.

locals {
  otel_waf_configured = var.otel_rate_limit_per_5min > 0 || length(var.otel_allowed_cidrs) > 0
  # The web ACL itself can be created on the first pass; only the association
  # waits until the OTel ALB has been created by the LBC (var.otel_alb_dns_name
  # is the two-pass marker, mirrored from modules/ingress/waf.tf).
  otel_waf_enabled = local.otel_waf_configured
  otel_waf_attach  = local.otel_waf_configured && var.otel_alb_dns_name != ""
}

resource "aws_wafv2_web_acl" "otel" {
  count = local.otel_waf_enabled ? 1 : 0

  name  = "${var.name_prefix}-otel-ingestion"
  scope = "REGIONAL"

  default_action {
    # If a CIDR allow-list is set, default-deny and allow only listed CIDRs.
    # Otherwise default-allow and rely on the rate limit.
    dynamic "allow" {
      for_each = length(var.otel_allowed_cidrs) > 0 ? [] : [1]
      content {}
    }
    dynamic "block" {
      for_each = length(var.otel_allowed_cidrs) > 0 ? [1] : []
      content {}
    }
  }

  # ── Allow-list rule ────────────────────────────────────────────────────────
  dynamic "rule" {
    for_each = length(var.otel_allowed_cidrs) > 0 ? [1] : []
    content {
      name     = "cidr-allow"
      priority = 0

      action {
        allow {}
      }

      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.otel_allow[0].arn
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name_prefix}-otel-cidr-allow"
        sampled_requests_enabled   = true
      }
    }
  }

  # ── Rate limit ─────────────────────────────────────────────────────────────
  dynamic "rule" {
    for_each = var.otel_rate_limit_per_5min > 0 ? [1] : []
    content {
      name     = "rate-limit"
      priority = 1

      action {
        block {}
      }

      statement {
        rate_based_statement {
          limit              = var.otel_rate_limit_per_5min
          aggregate_key_type = "IP"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name_prefix}-otel-rate-limit"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-otel"
    sampled_requests_enabled   = true
  }

  tags = {
    Name = "${var.name_prefix}-otel-ingestion"
  }
}

resource "aws_wafv2_ip_set" "otel_allow" {
  count = length(var.otel_allowed_cidrs) > 0 ? 1 : 0

  name               = "${var.name_prefix}-otel-allow"
  scope              = "REGIONAL"
  ip_address_version = "IPV4"
  addresses          = var.otel_allowed_cidrs

  tags = {
    Name = "${var.name_prefix}-otel-allow"
  }
}

# Look up the cloudops-otel ALB by tag (same pattern as the cloudops WAF).
# The LBC creates the ALB only after the OTel Ingress is applied, so the
# count guard mirrors the two-pass pattern from modules/ingress/waf.tf.
data "aws_lb" "otel" {
  count = local.otel_waf_attach ? 1 : 0

  tags = {
    "elbv2.k8s.aws/cluster" = var.eks_cluster_name
    "ingress.k8s.aws/stack" = "monitoring/cloudops-otel"
  }

  depends_on = [
    kubernetes_ingress_v1.otel_http,
    kubernetes_ingress_v1.otel_grpc,
  ]
}

resource "aws_wafv2_web_acl_association" "otel" {
  count = local.otel_waf_attach ? 1 : 0

  resource_arn = data.aws_lb.otel[0].arn
  web_acl_arn  = aws_wafv2_web_acl.otel[0].arn
}
