#CloudOps Bootstrap Module Outputs

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

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions OIDC authentication"
  value       = aws_iam_role.github_actions.arn
}

output "oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN"
  value       = aws_iam_openid_connect_provider.github.arn
}

output "permissions_boundary_arn" {
  description = "ARN of the workload permissions boundary, for every module that creates a role (null while enable_permissions_boundary is off)"
  value       = var.enable_permissions_boundary ? local.permissions_boundary_arn : null

  # Known at plan time, but a role must not be given the boundary before the
  # policy exists.
  depends_on = [aws_iam_policy.permissions_boundary]
}
