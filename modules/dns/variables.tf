#This file defines variables settings for CloudOps.
variable "domain_name" {
  description = "Domain name for the hosted zone"
  type        = string
}

#Defines the environment input value.
variable "environment" {
  description = "Environment name"
  type        = string
}

#Defines the tags input value.
variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
