output "domain_name" {
  description = "CodeArtifact domain name."
  value       = aws_codeartifact_domain.this.domain
}

output "domain_arn" {
  description = "CodeArtifact domain ARN."
  value       = aws_codeartifact_domain.this.arn
}

output "repository_names" {
  description = "CodeArtifact repository names keyed by logical repository name."
  value       = { for name, repo in aws_codeartifact_repository.this : name => repo.repository }
}

output "repository_arns" {
  description = "CodeArtifact repository ARNs keyed by logical repository name."
  value       = { for name, repo in aws_codeartifact_repository.this : name => repo.arn }
}
