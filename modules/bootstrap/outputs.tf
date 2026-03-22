# CloudOps Bootstrap Module Outputs

output "bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = data.aws_s3_bucket.terraform_state.id
}

output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = data.aws_s3_bucket.terraform_state.arn
}

output "kms_key_id" {
  description = "KMS key ID for state encryption (null if not created)"
  value       = var.create_kms ? aws_kms_key.terraform_state[0].id : null
}

output "kms_key_arn" {
  description = "KMS key ARN for state encryption (null if not created)"
  value       = var.create_kms ? aws_kms_key.terraform_state[0].arn : null
}

output "deployer_role_arn" {
  description = "IAM deployer role ARN"
  value       = aws_iam_role.deployer.arn
}

output "deployer_role_name" {
  description = "IAM deployer role name"
  value       = aws_iam_role.deployer.name
}
