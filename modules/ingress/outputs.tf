output "certificate_arn" {
  description = "ACM wildcard certificate ARN for *.tamendutta.com"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "hosted_zone_id" {
  description = "Route 53 hosted zone ID for tamendutta.com"
  value       = data.aws_route53_zone.main.zone_id
}

output "lb_controller_role_arn" {
  description = "IRSA role ARN for the AWS Load Balancer Controller"
  value       = aws_iam_role.lb_controller.arn
}
