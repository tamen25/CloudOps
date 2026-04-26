# WAFv2 web ACL — regional, attached to the public ALB.
# Created only when var.enable_waf = true. Defaults are OWASP-aligned and tight
# enough to block common automated abuse without breaking real users.

resource "aws_wafv2_web_acl" "main" {
  count = var.enable_waf ? 1 : 0

  name  = "${var.name_prefix}-public-alb"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  # ── Rate limit: 2000 req / 5 min / IP ───────────────────────────────────────
  rule {
    name     = "rate-limit"
    priority = 0

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.waf_rate_limit_per_5min
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS-managed: Core (CRS) ─────────────────────────────────────────────────
  rule {
    name     = "common-rule-set"
    priority = 1

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-common"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS-managed: Known bad inputs ───────────────────────────────────────────
  rule {
    name     = "known-bad-inputs"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-bad-inputs"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS-managed: SQL injection ──────────────────────────────────────────────
  rule {
    name     = "sqli"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesSQLiRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-sqli"
      sampled_requests_enabled   = true
    }
  }

  # ── AWS-managed: Anonymous IP list (Tor exits, hosting providers, public proxies) ─
  rule {
    name     = "anonymous-ip-list"
    priority = 4

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAnonymousIpList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name_prefix}-anon-ip"
      sampled_requests_enabled   = true
    }
  }

  # ── Geo block (optional) ────────────────────────────────────────────────────
  dynamic "rule" {
    for_each = length(var.waf_geo_block_countries) > 0 ? [1] : []
    content {
      name     = "geo-block"
      priority = 5

      action {
        block {}
      }

      statement {
        geo_match_statement {
          country_codes = var.waf_geo_block_countries
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name_prefix}-geo-block"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name_prefix}-public-alb"
    sampled_requests_enabled   = true
  }

  tags = merge(local.common_tags, { Name = "${var.name_prefix}-public-alb" })
}

# Association — attached to the ALB created by the LBC for the cloudops group.
# The ALB is created lazily by the LB controller once an Ingress in the
# "cloudops" group is applied. We can't reference it as a TF resource (not
# managed by this code), so we look it up by tag.

data "aws_lb" "public" {
  count = var.enable_waf && var.alb_dns_name != "" ? 1 : 0

  tags = {
    "elbv2.k8s.aws/cluster" = var.cluster_name
    "ingress.k8s.aws/stack" = "cloudops"
  }
}

resource "aws_wafv2_web_acl_association" "alb" {
  count = var.enable_waf && var.alb_dns_name != "" ? 1 : 0

  resource_arn = data.aws_lb.public[0].arn
  web_acl_arn  = aws_wafv2_web_acl.main[0].arn
}

# CloudWatch log group for WAF logs (sampled blocked requests).
resource "aws_cloudwatch_log_group" "waf" {
  count = var.enable_waf && var.waf_logging_enabled ? 1 : 0

  name              = "aws-waf-logs-${var.name_prefix}"
  retention_in_days = 30

  tags = local.common_tags
}

resource "aws_wafv2_web_acl_logging_configuration" "main" {
  count = var.enable_waf && var.waf_logging_enabled ? 1 : 0

  resource_arn            = aws_wafv2_web_acl.main[0].arn
  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]
}
