# Create a custom DB parameter group with logging and performance monitoring enabled
resource "aws_db_parameter_group" "main" {
  name   = "${var.name_prefix}-db-params"
  family = var.parameter_family

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_duration"
    value = "1"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-params"
    }
  )
}
