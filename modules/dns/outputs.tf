#This file defines outputs settings for CloudOps.
output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

#Exposes the name servers output value.
output "name_servers" {
  description = "Name servers for the hosted zone — update your registrar to these after first apply"
  value       = aws_route53_zone.main.name_servers
}
