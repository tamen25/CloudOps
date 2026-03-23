# Create a Secrets Manager secret to securely store database connection credentials
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.name_prefix}-db-credentials"
  description = "Database credentials for ${var.name_prefix} ${var.environment} environment"

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-credentials"
    }
  )
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
