#Create the primary RDS database instance with encryption, backups, and monitoring enabled
resource "aws_db_instance" "primary" {
  #checkov:skip=CKV_AWS_157:Multi-AZ disabled intentionally - cost optimization for dev environment
  #checkov:skip=CKV_AWS_293:Deletion protection disabled intentionally - dev environment requires easy teardown
  #checkov:skip=CKV_AWS_354:Performance Insights KMS CMK not required - AWS managed encryption is acceptable
  identifier     = "${var.name_prefix}-db-primary"
  instance_class = var.instance_class
  engine         = var.engine
  engine_version = var.engine_version

  db_name  = var.database_name
  port     = var.database_port
  username = var.master_username
  password = random_password.master_password.result

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = var.storage_type
  storage_encrypted     = var.storage_encrypted
  kms_key_id            = var.kms_key_id
  iops                  = var.iops
  storage_throughput    = var.storage_throughput

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = var.publicly_accessible

  multi_az = var.multi_az

  backup_retention_period   = var.backup_retention_period
  backup_window             = var.backup_window
  maintenance_window        = var.maintenance_window
  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : local.final_snapshot_id
  copy_tags_to_snapshot     = var.copy_tags_to_snapshot

  deletion_protection                 = var.deletion_protection
  iam_database_authentication_enabled = var.iam_database_authentication_enabled

  parameter_group_name = aws_db_parameter_group.main.name

  enabled_cloudwatch_logs_exports       = var.enabled_cloudwatch_logs_exports
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_period : null
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = var.monitoring_interval > 0 ? aws_iam_role.rds_monitoring.arn : null

  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-primary"
      Role = "primary"
    }
  )

  lifecycle {
    prevent_destroy = false
    ignore_changes = [
      password,
    ]
  }
}

#Create a read replica of the primary database instance for improved read performance and availability
resource "aws_db_instance" "replica" {
  count = var.create_read_replica ? 1 : 0

  identifier          = "${var.name_prefix}-db-replica"
  instance_class      = var.instance_class
  replicate_source_db = aws_db_instance.primary.identifier

  storage_encrypted = var.storage_encrypted
  kms_key_id        = var.kms_key_id

  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = var.publicly_accessible

  backup_retention_period = var.backup_retention_period
  skip_final_snapshot     = var.skip_final_snapshot
  copy_tags_to_snapshot   = var.copy_tags_to_snapshot

  enabled_cloudwatch_logs_exports       = var.enabled_cloudwatch_logs_exports
  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = var.performance_insights_enabled ? var.performance_insights_retention_period : null
  monitoring_interval                   = var.monitoring_interval
  monitoring_role_arn                   = var.monitoring_interval > 0 ? aws_iam_role.rds_monitoring.arn : null

  auto_minor_version_upgrade = var.auto_minor_version_upgrade

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-db-replica"
      Role = "replica"
    }
  )

  lifecycle {
    prevent_destroy = false
  }
}
