#This file defines variables settings for CloudOps.
variable "domain_name" {
  description = "CodeArtifact domain name for internal CloudOps packages."
  type        = string
}

#Defines the repository names input value.
variable "repository_names" {
  description = "CodeArtifact repository names to create inside the domain."
  type        = list(string)
  default     = ["cloudops-nodejs", "cloudops-java", "cloudops-dotnet", "cloudops-python"]

  validation {
    condition     = length(var.repository_names) > 0
    error_message = "At least one CodeArtifact repository name is required."
  }
}

#Defines the KMS key arn input value.
variable "kms_key_arn" {
  description = "Optional KMS key ARN for CodeArtifact domain encryption. Empty uses the AWS-managed key."
  type        = string
  default     = ""
}

#Defines the tags input value.
variable "tags" {
  description = "Common tags applied to CodeArtifact resources."
  type        = map(string)
  default     = {}
}
