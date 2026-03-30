# Public hosted zone — created by Terraform, no prior manual setup required.
# After first apply, update your domain registrar's nameservers to the values in
# the route53_name_servers output so DNS resolves correctly.
resource "aws_route53_zone" "main" {
  name = "tamendutta.com"

  tags = merge(var.tags, {
    Name        = "tamendutta.com"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

locals {
  zone_id = aws_route53_zone.main.zone_id
}

# A records are created only after the LBC has provisioned the ALB and alb_dns_name is set.
# First deploy: leave alb_dns_name empty. Second deploy: set it to the ALB DNS name.

resource "aws_route53_record" "api" {
  count = var.alb_dns_name != "" ? 1 : 0

  zone_id = local.zone_id
  name    = "api.tamendutta.com"
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
  name    = "grafana.tamendutta.com"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
