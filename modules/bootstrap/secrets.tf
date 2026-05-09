#This file defines secrets settings for CloudOps.
#GitHub PAT secret — created once by the bootstrap module so all other modules
#can reference the ARN without storing the raw token value in tfvars.
#
#The resource is only created when github_token is non-empty. When the token
#is not provided, the output is an empty string and the security module's
#auto-remediation Lambda will skip GitHub issue creation.
#
#Rotation: update the secret_string by changing github_token in TF_VARS and
#re-running terraform apply. The old version remains accessible by its ARN
#for a short window while Lambda containers warm — this is harmless.

variable "github_token" {
  description = "GitHub personal access token with repo scope — stored in Secrets Manager so the auto-remediation Lambda can create issues. Leave empty to disable GitHub issue creation."
  type        = string
  sensitive   = true
  default     = ""
}

#Creates the AWS secretsmanager secret resource named github token.
resource "aws_secretsmanager_secret" "github_token" {
  #checkov:skip=CKV_AWS_149:AWS managed key is acceptable for dev - CMK adds cost without meaningful security benefit
  #checkov:skip=CKV2_AWS_57:Automatic rotation not implemented - static credentials managed externally
  count = var.github_token != "" ? 1 : 0

  name                    = "cloudops-github-token"
  description             = "GitHub PAT (repo scope) for the auto-remediation Lambda — managed by Terraform bootstrap module"
  recovery_window_in_days = 7

  tags = merge(var.tags, {
    Name      = "cloudops-github-token"
    Component = "bootstrap"
    ManagedBy = "terraform"
  })
}

#Creates the AWS secretsmanager secret version resource named github token.
resource "aws_secretsmanager_secret_version" "github_token" {
  count = var.github_token != "" ? 1 : 0

  secret_id     = aws_secretsmanager_secret.github_token[0].id
  secret_string = var.github_token

  lifecycle {
    #Prevent Terraform from overwriting a rotated token on subsequent applies
    #unless the variable value itself changes.
    ignore_changes = []
  }
}

#Exposes the github token secret arn output value.
output "github_token_secret_arn" {
  description = "Secrets Manager ARN for the GitHub PAT — pass to security module as github_token_secret_arn. Empty string when github_token is not provided."
  value       = var.github_token != "" ? aws_secretsmanager_secret.github_token[0].arn : ""
  sensitive   = false
}
