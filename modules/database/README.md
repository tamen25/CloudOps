<!-- This document explains readme for CloudOps. -->
# Database Module

Production-grade managed RDS PostgreSQL database with encryption, automated backups, and disaster recovery support.

## Purpose

This module provides **stateful infrastructure** for CloudOps applications. It implements AWS-managed PostgreSQL with enterprise-grade features:

- **Encryption at rest** using KMS
- **Automated backups** with configurable retention
- **Multi-AZ deployment** for automatic failover
- **Read replicas** for disaster recovery and read scaling
- **Secrets Manager** integration for secure credential management
- **CloudWatch monitoring** with production-grade alarms

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Private Subnets                     │
│  ┌──────────────────┐           ┌──────────────────┐   │
│  │  RDS Primary     │◄─────────►│  RDS Standby     │   │
│  │  (AZ-1)          │  Multi-AZ │  (AZ-2)          │   │
│  │  Encrypted       │ Failover  │  Encrypted       │   │
│  └────────┬─────────┘           └──────────────────┘   │
│           │                                              │
│           │ Replication                                  │
│           ▼                                              │
│  ┌──────────────────┐                                   │
│  │  Read Replica    │ (Optional)                        │
│  │  DR / Scaling    │                                   │
│  └──────────────────┘                                   │
└─────────────────────────────────────────────────────────┘
           │
           ▼
  ┌────────────────────┐
  │ Secrets Manager    │ ← ECS Tasks retrieve credentials
  │ DB Credentials     │   via IAM role
  └────────────────────┘
```

## Usage

### Basic Usage (Development)

```hcl
module "database" {
  source = "./modules/database"

  environment  = "dev"
  name_prefix  = "cloudops-dev"
  vpc_id       = module.networking.vpc_id
  db_subnet_ids = module.networking.database_subnet_ids
  rds_security_group_id = module.networking.rds_sg_id

  # Dev configuration: cost-optimized
  instance_class   = "db.t3.micro"
  allocated_storage = 20
  multi_az         = false
  create_read_replica = false

  # Dev-friendly settings
  deletion_protection = false
  skip_final_snapshot = true
  backup_retention_period = 1

  tags = {
    Environment = "dev"
    Owner       = "platform-team"
  }
}
```

### Production Usage

```hcl
module "database" {
  source = "./modules/database"

  environment  = "prod"
  name_prefix  = "cloudops-prod"
  vpc_id       = module.networking.vpc_id
  db_subnet_ids = module.networking.database_subnet_ids
  rds_security_group_id = module.networking.rds_sg_id

  # Production configuration: resilience over cost
  instance_class        = "db.r6g.large"
  allocated_storage     = 100
  max_allocated_storage = 500
  multi_az             = true
  create_read_replica  = true

  # Production-grade settings
  deletion_protection     = true
  skip_final_snapshot     = false
  backup_retention_period = 30

  # Enhanced monitoring
  performance_insights_enabled = true
  monitoring_interval         = 60

  tags = {
    Environment = "prod"
    Owner       = "platform-team"
    Compliance  = "required"
  }
}
```

## How Credentials Are Retrieved

### By Applications (ECS Tasks)

1. **ECS task role** is granted `secretsmanager:GetSecretValue` permission for the specific secret ARN
2. **Application code** calls Secrets Manager API to retrieve credentials:

```javascript
// Node.js example
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const client = new SecretsManagerClient({ region: 'us-east-1' });
const response = await client.send(new GetSecretValueCommand({
  SecretId: process.env.DB_SECRET_ARN
}));

const credentials = JSON.parse(response.SecretString);
// credentials.host, credentials.port, credentials.username, credentials.password
```

3. **Environment variables** in ECS task definition:
   - `DB_SECRET_ARN` - Points to Secrets Manager secret
   - Application retrieves actual credentials at runtime

### By Operators (Manual Access)

```bash
# Retrieve secret value
aws secretsmanager get-secret-value \
  --secret-id cloudops-dev-db-credentials \
  --query SecretString \
  --output text | jq .

# Connect to database
aws secretsmanager get-secret-value \
  --secret-id cloudops-dev-db-credentials \
  --query SecretString \
  --output text | jq -r '"postgresql://\(.username):\(.password)@\(.host):\(.port)/\(.dbname)"' | xargs psql
```

## Disaster Recovery Strategy

### Current Implementation: Read Replica

**Pattern**: Primary in Region A + Read Replica in Region A (or Region B)

**How it works**:
1. Set `create_read_replica = true`
2. Read replica continuously replicates from primary
3. Can promote replica to primary during disaster
4. RPO (Recovery Point Objective): ~seconds (based on replication lag)
5. RTO (Recovery Time Objective): ~minutes (manual promotion)

**Promotion process**:
```bash
# 1. Promote read replica to standalone instance
aws rds promote-read-replica \
  --db-instance-identifier cloudops-prod-db-replica

# 2. Update application to point to new endpoint
# 3. Verify data integrity
# 4. Create new replica from promoted instance
```

### Future: Aurora Global Database (Upgrade Path)

To upgrade to **Aurora Global Database** for faster DR:

**Changes required**:
1. Replace `aws_db_instance` with `aws_rds_cluster` (Aurora)
2. Use `aws_rds_global_cluster` for cross-region replication
3. Add secondary region provider:
   ```hcl
   provider "aws" {
     alias  = "secondary"
     region = "us-west-2"
   }
   ```
4. Deploy Aurora cluster in secondary region
5. Global database replicates across regions automatically

**Benefits**:
- RPO: < 1 second (continuous replication)
- RTO: < 1 minute (automatic failover)
- Read from any region

## Cost Considerations

### Development Mode (Low Cost)
- Instance: `db.t3.micro` (~$13/month)
- Storage: 20GB gp3 (~$2.30/month)
- Single-AZ: No standby instance
- No read replica
- **Total: ~$15/month**

### Production Mode (Resilience)
- Instance: `db.r6g.large` (~$146/month)
- Storage: 100GB gp3 (~$11.50/month)
- Multi-AZ: 2x instance cost (~$292/month)
- Read replica: +$146/month
- Backups: ~$5/month
- **Total: ~$455/month**

### Cost Optimization Tips
1. Use **t3 instances** for dev (burstable, cheaper)
2. Use **r6g (Graviton2)** for prod (20% cheaper than r5, better performance)
3. Enable **autoscaling storage** (pay for what you use)
4. Use **gp3 instead of gp2** (20% cheaper, better performance)
5. Reduce **backup retention** in dev (1-7 days vs 30)
6. Disable **Multi-AZ** in dev (single-AZ is fine)
7. Disable **read replica** unless needed for DR or read scaling

## Switching Between Dev and Prod

### Dev to Prod
```hcl
# terraform.tfvars
database_instance_class        = "db.r6g.large"  # was: db.t3.micro
database_allocated_storage     = 100             # was: 20
database_multi_az             = true             # was: false
database_create_read_replica  = true             # was: false
database_deletion_protection  = true             # was: false
database_skip_final_snapshot  = false            # was: true
database_backup_retention     = 30               # was: 1
```

**WARNING**: Changing instance class or Multi-AZ setting requires **downtime** (usually 5-15 minutes).

### Prod to Dev (Cost Reduction)
Reverse the above changes. **Creates a final snapshot** before downgrade (unless `skip_final_snapshot = true`).

## Security Features

### Encryption
- ✅ **At rest**: AES-256 encryption using KMS (default `aws/rds` key or custom CMK)
- ✅ **In transit**: SSL/TLS enforced (configure in parameter group)
- ✅ **Backups**: Encrypted with same key as instance

### Network Isolation
- ✅ **Private subnets only**: No public IP address
- ✅ **Security group**: Only ECS tasks can connect (port 5432)
- ✅ **VPC isolation**: No internet gateway access

### Access Control
- ✅ **Secrets Manager**: No plaintext passwords in code/configs
- ✅ **IAM authentication**: Optional (set `iam_database_authentication_enabled = true`)
- ✅ **Deletion protection**: Prevents accidental deletion in production

### Compliance
- ✅ **Audit logging**: CloudWatch Logs exports (postgresql, upgrade logs)
- ✅ **Performance Insights**: Query-level performance monitoring
- ✅ **Enhanced Monitoring**: OS-level metrics (60-second granularity)

## Monitoring & Alarms

### Pre-configured CloudWatch Alarms

1. **CPU Utilization** > 80% (2 evaluation periods)
   - Indicates: High query load or inefficient queries
   - Action: Investigate slow queries, consider instance upgrade

2. **Freeable Memory** < 256 MB
   - Indicates: Memory pressure, possible OOM
   - Action: Optimize queries, increase instance size

3. **Free Storage Space** < 2 GB
   - Indicates: Disk running out of space
   - Action: Enable autoscaling or increase allocated storage

4. **Database Connections** > 80
   - Indicates: Connection leak or high concurrency
   - Action: Check connection pooling, investigate idle connections

### Add SNS Notifications

Update `alarm_actions` in `main.tf`:
```hcl
alarm_actions = [aws_sns_topic.alerts.arn]
```

## Operational Procedures

### Taking Manual Snapshot
```bash
aws rds create-db-snapshot \
  --db-instance-identifier cloudops-prod-db-primary \
  --db-snapshot-identifier pre-migration-snapshot-$(date +%Y%m%d)
```

### Restoring from Snapshot
```bash
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier cloudops-prod-db-restored \
  --db-snapshot-identifier pre-migration-snapshot-20250101
```

### Point-in-Time Recovery
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier cloudops-prod-db-primary \
  --target-db-instance-identifier cloudops-prod-db-pitr \
  --restore-time 2025-01-01T12:00:00Z
```

### Viewing Logs
```bash
# List available log files
aws rds describe-db-log-files \
  --db-instance-identifier cloudops-prod-db-primary

# Download specific log file
aws rds download-db-log-file-portion \
  --db-instance-identifier cloudops-prod-db-primary \
  --log-file-name error/postgresql.log.2025-01-01-00
```

## Module Outputs

| Output | Description |
|--------|-------------|
| `rds_endpoint` | Primary database endpoint (host:port) |
| `rds_address` | Primary database hostname |
| `rds_port` | Database port (5432) |
| `rds_secret_arn` | Secrets Manager ARN for credentials |
| `rds_replica_endpoint` | Read replica endpoint (null if not created) |
| `multi_az_enabled` | Whether Multi-AZ is enabled |
| `read_replica_enabled` | Whether read replica is created |
| `storage_encrypted` | Whether storage is encrypted |
| `deletion_protection_enabled` | Whether deletion protection is enabled |

## Design Philosophy

This module is NOT about writing SQL or building schemas.

It is about:
- ✅ **Operating state safely**: Encryption, backups, deletion protection
- ✅ **Preparing for failure**: Multi-AZ, read replicas, point-in-time recovery
- ✅ **Enabling CloudOps capabilities**: DR testing, compliance scanning, self-healing
- ✅ **Reflecting real-world production practices**: Not minimal examples

## Next Steps

1. **Secret Rotation**: Implement Lambda function for automatic password rotation
2. **Cross-Region DR**: Upgrade to Aurora Global Database
3. **Query Performance**: Enable pg_stat_statements and slow query logging
4. **Connection Pooling**: Add RDS Proxy for connection management
5. **Cost Alerts**: Add billing alarms for unexpected storage growth
