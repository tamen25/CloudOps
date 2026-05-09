#This file defines outputs settings for CloudOps.
output "domain_name" {
  description = "CodeArtifact domain name."
  value       = aws_codeartifact_domain.this.domain
}

#Exposes the domain arn output value.
output "domain_arn" {
  description = "CodeArtifact domain ARN."
  value       = aws_codeartifact_domain.this.arn
}

#Exposes the repository names output value.
output "repository_names" {
  description = "CodeArtifact repository names keyed by logical repository name."
  value       = { for name, repo in aws_codeartifact_repository.this : name => repo.repository }
}

#Exposes the repository arns output value.
output "repository_arns" {
  description = "CodeArtifact repository ARNs keyed by logical repository name."
  value       = { for name, repo in aws_codeartifact_repository.this : name => repo.arn }
}
