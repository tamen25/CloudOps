# Backlog #53 — manage SSE on the existing Terraform state bucket from
# Terraform itself, switching to SSE-KMS using the bootstrap KMS key when
# one was created.
#
# The bucket is still provisioned out-of-band by `create-s3-bucket.sh` (it
# has to exist before Terraform can use it as a backend), but ownership of
# the encryption configuration moves into TF after the first apply. This
# closes the "key exists but bucket still uses AES256" gap.
#
# Migration:
#   1. After the first apply that adds this resource, the existing bucket
#      flips from AES256 → SSE-KMS. Pre-existing state objects stay
#      AES256-encrypted (S3 does NOT re-encrypt on PUT-encryption-config);
#      they re-encrypt on the next write. Force a re-encrypt by running:
#        aws s3 cp s3://<bucket>/ s3://<bucket>/ --recursive --metadata-directive REPLACE --sse aws:kms --sse-kms-key-id <key-id>
#   2. Pass `kms_key_id=<arn>` to `terraform init -backend-config` (handled
#      automatically by `scripts/tf-init.sh` when the alias resolves).

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = data.aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = var.create_kms ? "aws:kms" : "AES256"
      kms_master_key_id = var.create_kms ? aws_kms_key.terraform_state[0].arn : null
    }
    bucket_key_enabled = var.create_kms
  }
}
