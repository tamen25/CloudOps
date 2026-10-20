output "vault_name" {
  description = "AWS Backup vault name."
  value       = aws_backup_vault.main.name
}

output "vault_arn" {
  description = "AWS Backup vault ARN."
  value       = aws_backup_vault.main.arn
}

output "plan_id" {
  description = "AWS Backup plan ID."
  value       = aws_backup_plan.main.id
}
