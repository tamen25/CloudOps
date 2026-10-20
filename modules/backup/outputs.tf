output "vault_name" {
  description = "AWS Backup vault name."
  value       = aws_backup_vault.main.name
}

#Exposes the vault arn output value.
output "vault_arn" {
  description = "AWS Backup vault ARN."
  value       = aws_backup_vault.main.arn
}

#Exposes the plan ID output value.
output "plan_id" {
  description = "AWS Backup plan ID."
  value       = aws_backup_plan.main.id
}
