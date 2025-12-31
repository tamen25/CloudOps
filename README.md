# CloudOps

Enterprise-grade AWS infrastructure management using Terraform with secure remote state.

## Overview

CloudOps provisions and manages AWS resources across multiple environments (dev, staging, production) with:
- VPC networking with public/private/database subnets
- ECS Fargate compute with autoscaling
- Application Load Balancer
- Secure S3 remote state with native locking (Terraform 1.11+)

## Prerequisites

- AWS Account with administrative access
- AWS CLI >= 2.0
- Terraform >= 1.5.0
- Git Bash (for Windows users)

## Quick Start

### 1. Configure AWS Credentials

```bash
aws configure
# Or use environment variables
export AWS_ACCESS_KEY_ID="your-access-key"
export AWS_SECRET_ACCESS_KEY="your-secret-key"
export AWS_DEFAULT_REGION="us-east-1"

# Verify
aws sts get-caller-identity
```

### 2. Configure Variables

Edit `terraform.tfvars` with your settings:
- Set `project_name`, `environment`, `owner`
- Adjust `region` if not using us-east-1
- Configure VPC CIDR and subnets (optional)
- Set compute resources (optional)

**Important:** Update the S3 bucket name in `provider.tf` to match your project:
```hcl
backend "s3" {
  bucket = "cloudops-tfstate-bucket"  # Change to {project_name}-tfstate-bucket
  region = "us-east-1"                 # Match your terraform.tfvars region
}
```

### 3. Deploy

```bash
./deploy.sh
```

This script will:
1. Create S3 bucket for Terraform state
2. Initialize Terraform with S3 backend
3. Deploy infrastructure (bootstrap module with KMS + IAM)
4. Store state in S3 immediately

### 4. Enable Additional Modules

Edit `terraform.tfvars` to enable modules progressively:

```hcl
enable_networking = true  # Enable VPC and networking
enable_compute    = true  # Enable ECS Fargate and ALB
```

Then apply:
```bash
terraform apply
```

## Project Structure

```
CloudOps/
├── main.tf              # Root configuration
├── provider.tf          # AWS provider + backend config
├── variables.tf         # Variable definitions
├── outputs.tf           # Output definitions
├── terraform.tfvars     # Your configuration values
├── deploy.sh            # Automated deployment script
├── destroy.sh           # Infrastructure teardown script
└── modules/
    ├── bootstrap/       # S3 state bucket + IAM deployer role
    │   ├── main.tf
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── create-s3-bucket.sh
    ├── networking/      # VPC, subnets, security groups
    │   ├── main.tf
    │   ├── variables.tf
    │   ├── outputs.tf
    │   └── security_groups.tf
    └── compute/         # ECS Fargate, ALB, autoscaling
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

## Module Toggle System

Control which modules are deployed via `terraform.tfvars`:

```hcl
enable_networking = false  # VPC and networking resources
enable_compute    = false  # ECS Fargate and ALB
destroy_all       = false  # DANGER: Complete teardown
```

## What Gets Created

### Bootstrap Module
- S3 bucket for Terraform state (encrypted, versioned)
- KMS key for encryption (optional)
- IAM deployer role with infrastructure permissions

### Networking Module
- VPC with configurable CIDR
- Public, private, and database subnets across multiple AZs
- Internet Gateway and NAT Gateway
- Route tables and routing
- Security groups for ALB, ECS tasks, and RDS
- VPC Flow Logs (optional)

### Compute Module
- ECR repository for Docker images
- ECS Fargate cluster
- Task definitions with CloudWatch logging
- Application Load Balancer with health checks
- Auto-scaling policies (CPU and memory-based)
- IAM roles for task execution

## Security Features

- S3 state encryption with versioning
- S3 native state locking (no DynamoDB needed)
- Public access blocking on state bucket
- IAM deployer role with least-privilege
- Security groups with minimal required access
- KMS encryption for additional security
- VPC Flow Logs for network monitoring

## Infrastructure Teardown

To destroy all infrastructure:

```bash
./destroy.sh
```

Or manually:

```bash
# 1. Disable modules progressively
# Edit terraform.tfvars:
enable_compute    = false
terraform apply

enable_networking = false
terraform apply

# 2. Destroy bootstrap (and everything else)
destroy_all = true
terraform apply

# 3. Delete S3 bucket manually (has deletion protection)
aws s3 rb s3://your-bucket-name --force
```

## Configuration Examples

### Development Environment

```hcl
environment        = "dev"
enable_nat_gateway = false  # Save costs
enable_flow_logs   = false
desired_count      = 1
cpu                = "256"
memory             = "512"
```

### Production Environment

```hcl
environment        = "prod"
enable_nat_gateway = true   # High availability
enable_flow_logs   = true
desired_count      = 3
cpu                = "1024"
memory             = "2048"
```

## Troubleshooting

### S3 Bucket Already Exists

S3 bucket names must be globally unique. Set a custom name in `terraform.tfvars`:

```hcl
bootstrap_bucket_name = "my-unique-company-tfstate-bucket"
```

### Access Denied

Ensure your AWS credentials have administrative permissions for initial bootstrap.

### Backend Initialization Issues

1. Verify S3 bucket exists: `aws s3 ls s3://your-bucket-name`
2. Check backend configuration matches bootstrap outputs
3. Ensure you have S3 access permissions

## Support

- AWS Provider Documentation: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- Terraform Documentation: https://www.terraform.io/docs

## License

Internal use only - Proprietary
