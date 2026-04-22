output "certificate_arn" {
  description = "ACM wildcard certificate ARN for *.${var.domain_name}"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "hosted_zone_id" {
  description = "Route 53 hosted zone ID for ${var.domain_name}"
  value       = var.zone_id
}

output "lb_controller_role_arn" {
  description = "IRSA role ARN for the AWS Load Balancer Controller"
  value       = aws_iam_role.lb_controller.arn
}
