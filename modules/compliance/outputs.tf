output "cloudtrail_arn" {
  description = "CloudTrail ARN. Empty when CloudTrail is disabled."
  value       = var.enable_cloudtrail ? aws_cloudtrail.main[0].arn : ""
}

output "guardduty_detector_id" {
  description = "GuardDuty detector ID. Empty when GuardDuty is disabled."
  value       = var.enable_guardduty ? aws_guardduty_detector.main[0].id : ""
}

output "config_recorder_name" {
  description = "AWS Config recorder name. Empty when Config is disabled."
  value       = var.enable_config ? aws_config_configuration_recorder.main[0].name : ""
}
