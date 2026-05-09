#This file defines outputs settings for CloudOps.
#CloudOps Bootstrap Module Outputs

output "bucket_name" {
  description = "S3 bucket name for Terraform state"
  value       = data.aws_s3_bucket.terraform_state.id
}

#Exposes the bucket arn output value.
output "bucket_arn" {
  description = "S3 bucket ARN"
  value       = data.aws_s3_bucket.terraform_state.arn
}

#Exposes the KMS key ID output value.
output "kms_key_id" {
  description = "KMS key ID for state encryption (null if not created)"
  value       = var.create_kms ? aws_kms_key.terraform_state[0].id : null
}

#Exposes the KMS key arn output value.
output "kms_key_arn" {
  description = "KMS key ARN for state encryption (null if not created)"
  value       = var.create_kms ? aws_kms_key.terraform_state[0].arn : null
}

#Exposes the deployer role arn output value.
output "deployer_role_arn" {
  description = "IAM deployer role ARN"
  value       = aws_iam_role.deployer.arn
}

#Exposes the deployer role name output value.
output "deployer_role_name" {
  description = "IAM deployer role name"
  value       = aws_iam_role.deployer.name
}

#Exposes the github actions role arn output value.
output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC authentication"
  value       = aws_iam_role.github_actions.arn
}

#Exposes the OIDC provider arn output value.
output "oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}
