# DB parameter group — logging knobs are tunable per environment to avoid
# leaking customer payloads in production. Closes backlog #41.
#
# Defaults are dev-friendly (log everything for debugging). Production should:
#   - log_statement   = "ddl"  (or "none") — never log DML payloads
#   - log_duration    = "0"    — rely on log_min_duration_statement instead
#   - log_min_duration_statement = "500" — log queries slower than 500 ms only
# The companion CLAUDE.md "Production logging policy" subsection documents
# retention + redaction guidance + incident-access procedures.
resource "aws_db_parameter_group" "main" {
  name   = "${var.name_prefix}-db-params"
  family = var.parameter_family

  parameter {
    name  = "log_connections"
    value = var.log_connections ? "1" : "0"
  }

  parameter {
    name  = "log_disconnections"
    value = var.log_disconnections ? "1" : "0"
  }

  parameter {
    name  = "log_duration"
    value = var.log_duration ? "1" : "0"
  }

  parameter {
    name  = "log_statement"
    value = var.log_statement
  }

  parameter {
    name  = "log_min_duration_statement"
    value = tostring(var.log_min_duration_statement_ms)
  }

  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  # Backlog #57 — refuse plaintext PG connections at the server, so a missing
  # client SSL config fails fast at handshake instead of silently sending
  # credentials/queries in cleartext.
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-params"
    }
  )
}
