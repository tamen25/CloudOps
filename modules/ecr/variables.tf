variable "name_prefix" {
  description = "Prefix for the repository names: <name_prefix>/<image>"
  type        = string
}

variable "repositories" {
  description = "Image names, one repository each"
  type        = list(string)
}

variable "keep_images" {
  description = "Images kept per repository; older ones expire"
  type        = number
  default     = 20
}

variable "kms_key_arn" {
  description = "KMS key for image encryption; null uses AES256"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags applied to every repository"
  type        = map(string)
  default     = {}
}
