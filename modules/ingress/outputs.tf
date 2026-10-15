output "certificate_arn" {
  description = "ACM wildcard certificate ARN for the project domain"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

#Exposes the hosted zone ID output value.
output "hosted_zone_id" {
  description = "Route 53 hosted zone ID for the project domain"
  value       = var.zone_id
}

#Exposes the lb controller role arn output value.
output "lb_controller_role_arn" {
  description = "IRSA role ARN for the AWS Load Balancer Controller"
  value       = aws_iam_role.lb_controller.arn
}
