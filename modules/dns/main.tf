terraform {
  required_version = ">= 1.5.0"
}

# Public hosted zone — created once and kept alive permanently.
# Only destroyed when destroy_all = true (module count = 0 at root level).
# After first apply, update your domain registrar's nameservers to the values
# in the name_servers output so DNS resolves correctly.
resource "aws_route53_zone" "main" {
  name = var.domain_name

  tags = merge(var.tags, {
    Name        = var.domain_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}
