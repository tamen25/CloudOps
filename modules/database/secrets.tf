# Create a Secrets Manager secret to securely store database connection credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  #checkov:skip=CKV_AWS_149:CMK use is gated by var.kms_key_id — caller decides per environment
  name                    = "${var.name_prefix}-db-credentials"
  description             = "Database credentials for ${var.name_prefix} ${var.environment} environment"
  kms_key_id              = var.kms_key_id
  recovery_window_in_days = var.secret_recovery_window_days

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-credentials"
    }
  )
}

# Automatic rotation. Caller must deploy the SAR rotation Lambda
# (SecretsManagerRDSPostgreSQLRotationSingleUser) and pass its ARN.
resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  count = var.rotation_enabled && var.rotation_lambda_arn != "" ? 1 : 0

  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = var.rotation_days
  }
}

# Store the database connection details and credentials as a JSON-encoded secret version
resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    username             = var.master_username
    password             = random_password.master_password.result
    engine               = var.engine
    host                 = aws_db_instance.primary.address
    port                 = aws_db_instance.primary.port
    dbname               = var.database_name
    dbInstanceIdentifier = aws_db_instance.primary.id
  })

  lifecycle {
    ignore_changes = [
      secret_string,
    ]
  }
}
