# CloudOps Infrastructure Cost Breakdown

## Monthly Cost Estimates (us-east-1)

### Development Environment
**Total: ~$45-75/month** (without NAT Gateway)
**Total: ~$110-140/month** (with NAT Gateway)

| Service | Resource | Configuration | Monthly Cost | Notes |
|---------|----------|---------------|--------------|-------|
| **Networking** | VPC | Free | $0 | - |
| | Internet Gateway | Free | $0 | - |
| | NAT Gateway (per AZ) | 2 AZs | $64.80 | $0.045/hour × 2 × 730 hours |
| | NAT Gateway Data | ~10 GB | $0.90 | $0.045/GB processed |
| | Elastic IPs (attached) | 2 | $0 | Free when attached |
| **Compute** | ECS Fargate | 0.25 vCPU, 512 MB | $10.73 | 2 tasks × $0.0073/hour × 730 |
| | Application Load Balancer | 1 ALB | $16.20 | $0.0225/hour × 730 |
| | ALB Data (LCUs) | ~5 LCUs | $5.00 | Variable based on traffic |
| | ECR Storage | 1 GB | $0.10 | $0.10/GB/month |
| **Database** | RDS PostgreSQL | db.t3.micro | $12.41 | $0.017/hour × 730 |
| | RDS Storage | 20 GB gp3 | $2.30 | $0.115/GB/month |
| | RDS Backup Storage | 20 GB | $0 | Free up to DB size |
| **Storage** | S3 (Terraform state) | <1 GB | $0.02 | $0.023/GB |
| **Monitoring** | CloudWatch Logs | 1 GB | $0.50 | $0.50/GB ingested |
| | CloudWatch Metrics | Custom metrics | $0 | 10 free metrics |
| **Secrets** | Secrets Manager | 1 secret | $0.40 | $0.40/secret/month |
| | Secret API calls | ~1000 | $0.05 | $0.05/10k calls |

### Production Environment
**Total: ~$750-1000/month** (3 AZs, High Availability)

| Service | Resource | Configuration | Monthly Cost | Notes |
|---------|----------|---------------|--------------|-------|
| **Networking** | NAT Gateway (per AZ) | 3 AZs | $97.20 | $0.045/hour × 3 × 730 |
| | NAT Gateway Data | ~100 GB | $9.00 | $0.045/GB × 2 (out + in) |
| **Compute** | ECS Fargate | 1 vCPU, 2 GB | $214.60 | 4 tasks × $0.0733/hour × 730 |
| | Application Load Balancer | 1 ALB | $16.20 | Same as dev |
| | ALB Data (LCUs) | ~25 LCUs | $25.00 | Higher traffic |
| | ECR Storage | 10 GB | $1.00 | More images |
| **Database** | RDS PostgreSQL | db.r6g.large | $146.00 | $0.20/hour × 730 |
| | RDS Multi-AZ | Enabled | $146.00 | 2× instance cost |
| | RDS Read Replica | db.r6g.large | $146.00 | Additional replica |
| | RDS Storage | 100 GB gp3 | $11.50 | $0.115/GB |
| | RDS Provisioned IOPS | 3000 IOPS | $0 | Included with gp3 |
| | RDS Backup Storage | 100 GB | $10.00 | $0.095/GB over DB size |
| **Storage** | S3 (Terraform state) | <1 GB | $0.02 | Same as dev |
| **Monitoring** | CloudWatch Logs | 10 GB | $5.00 | Higher log volume |
| | Performance Insights | Enabled | $0 | Free for 7 days retention |
| **Secrets** | Secrets Manager | 2 secrets | $0.80 | Primary + replica |

## Cost Optimization Strategies

### Development Environment

1. **Disable NAT Gateway** (Save ~$65/month)
   ```hcl
   enable_nat_gateway = false
   ```
   - Private subnets won't have internet access
   - ECS tasks use VPC endpoints for AWS services
   - Suitable for development/testing

2. **Reduce ECS Task Count** (Save ~$5/month per task)
   ```hcl
   desired_count = 1
   autoscaling_min_capacity = 1
   ```

3. **Use Smaller Instance** (Already minimal)
   ```hcl
   cpu    = "256"  # 0.25 vCPU
   memory = "512"  # 512 MB
   ```

4. **Disable Performance Insights** (Free tier, but good to know)
   ```hcl
   database_performance_insights_enabled = false
   ```

5. **Reduce Backup Retention** (Minimal savings)
   ```hcl
   database_backup_retention_period = 1  # Instead of 7
   ```

### Production Environment

1. **Right-Size Instances**
   - Monitor CPU/Memory metrics
   - Adjust RDS instance class based on actual usage
   - Use Compute Savings Plans (up to 66% off)

2. **Use Reserved Instances** (Save ~40%)
   - 1-year No Upfront: ~30% savings
   - 3-year All Upfront: ~60% savings
   - Applies to: RDS, ECS Fargate

3. **Optimize Data Transfer** (Save ~$5-10/month)
   - Keep traffic within same AZ when possible
   - Use VPC endpoints for S3, ECR, Secrets Manager
   - Reduces NAT Gateway data processing

4. **Database Optimization**
   - Single-AZ for non-critical environments (save $146)
   - Remove read replica if not needed (save $146)
   - Use Aurora Serverless v2 for variable workloads

5. **Auto-Scaling Configuration**
   ```hcl
   autoscaling_min_capacity = 2   # Start low
   autoscaling_max_capacity = 10  # Scale up as needed
   ```
   - Only pay for capacity you use
   - Scale based on actual CPU/Memory metrics

## Hidden Costs to Watch

| Item | Typical Cost | How to Avoid |
|------|--------------|--------------|
| Data Transfer Out | $0.09/GB | Use CloudFront for static content |
| Cross-AZ Data Transfer | $0.01/GB | Keep traffic in same AZ |
| Elastic IP (unattached) | $3.60/month | Delete unused EIPs |
| RDS Snapshot Storage | $0.095/GB | Delete old snapshots |
| CloudWatch Logs Storage | $0.03/GB/month | Set retention policies |
| Secrets Manager API Calls | $0.05/10k | Cache secrets in app |
| ALB Rules (>10) | $0.008/rule/hour | Consolidate rules |

## Cost Monitoring

### AWS Cost Explorer Tags
All resources are tagged for cost allocation:
```hcl
tags = {
  Project     = "cloudops"
  Environment = "dev" | "prod"
  ManagedBy   = "Terraform"
  Owner       = "your-name"
}
```

### Set Up Billing Alarms
1. Go to CloudWatch → Billing → Create Alarm
2. Set threshold (e.g., $100/month for dev)
3. Configure SNS notification

### Monthly Review Checklist
- [ ] Review Cost Explorer by service
- [ ] Check for unused resources (EIPs, snapshots)
- [ ] Verify autoscaling min/max is appropriate
- [ ] Review RDS instance utilization
- [ ] Check NAT Gateway data transfer volume
- [ ] Delete old ECR images (>10)
- [ ] Review CloudWatch Logs retention

## Cost Breakdown by Module

### Bootstrap Module
- S3 bucket: $0.02/month
- KMS key: $1/month (if enabled)
- **Total: ~$1/month**

### Networking Module
- VPC/Subnets: Free
- NAT Gateway: $32.40/AZ/month
- **Total: $0-97/month** (depends on AZ count and NAT)

### Compute Module
- ECS Fargate: $5-215/month (depends on CPU/Memory/count)
- ALB: $16-41/month (depends on traffic)
- ECR: $0.10-5/month (depends on image count)
- **Total: $21-261/month**

### Database Module
- RDS Instance: $12-438/month (depends on instance class and HA)
- Storage: $2-12/month
- Backups: $0-10/month
- Secrets Manager: $0.45/month
- **Total: $15-460/month**

## Comparison with Alternatives

### vs. EC2 + Self-Managed
- **CloudOps (Fargate)**: $45-75/month dev, easier management
- **EC2 (t3.micro)**: ~$7.50/month, more maintenance
- **Tradeoff**: Pay ~5-10x for fully managed, zero-ops

### vs. Serverless (Lambda + API Gateway)
- **CloudOps**: Predictable costs, always-on
- **Serverless**: $0 at low scale, expensive at high scale
- **Breakeven**: ~1M requests/month

### vs. Managed Kubernetes (EKS)
- **CloudOps**: $45-75/month dev
- **EKS**: $73/month (control plane) + workers
- **Tradeoff**: EKS more powerful, much higher minimum cost

## Free Tier Benefits (First 12 Months)

If using a new AWS account:
- 750 hours/month t2.micro (RDS): ~$12 savings
- 750 hours/month t2.micro (EC2): Not applicable (using Fargate)
- 5GB S3 Standard: Covers state files
- 1M Lambda requests: Not applicable
- **Total Savings: ~$12/month**

Note: Fargate and ALB are NOT covered by free tier.
