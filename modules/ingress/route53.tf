#DNS ownership (closes backlog #17):
#api.<domain>      → cloudops ALB        (alb_dns_name)
#grafana.<domain>  → cloudops ALB        (alb_dns_name)        — shared with order-api
#otel.<domain>     → cloudops-otel ALB   (otel_alb_dns_name)   — separate, gRPC traceport
#
#A records are created only after the LBC has provisioned each ALB and the
#matching var.*_alb_dns_name is set. First deploy: leave them empty. Second
#deploy: set them to the ALB DNS names.

resource "aws_route53_record" "api" {
  count = var.alb_dns_name != "" ? 1 : 0

  zone_id = local.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "grafana" {
  count = var.alb_dns_name != "" ? 1 : 0

  zone_id = local.zone_id
  name    = "${var.grafana_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "otel" {
  count = var.otel_alb_dns_name != "" ? 1 : 0

  zone_id = local.zone_id
  name    = "${var.otel_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.otel_alb_dns_name
    zone_id                = var.otel_alb_zone_id
    evaluate_target_health = true
  }
}
