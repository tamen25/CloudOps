# Creates a KMS key for encrypting Terraform state files in S3
resource "aws_kms_key" "terraform_state" {
  count = var.create_kms ? 1 : 0

  description             = "${var.project_name} Terraform state encryption key"
  deletion_window_in_days = var.kms_deletion_window
  enable_key_rotation     = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.project_name}-tfstate-kms"
    }
  )
}

# Creates a human-readable alias for the Terraform state KMS key
resource "aws_kms_alias" "terraform_state" {
  count = var.create_kms ? 1 : 0

  name          = "alias/${var.project_name}-tfstate-kms"
  target_key_id = aws_kms_key.terraform_state[0].key_id
}
