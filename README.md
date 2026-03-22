# CloudOps

Enterprise-grade AWS infrastructure management using Terraform with secure remote state.

## Overview

CloudOps provisions and manages AWS resources across multiple environments (dev, staging, production) with:
- VPC networking with public/private/database subnets
- ECS Fargate compute with autoscaling
- Application Load Balancer
- RDS PostgreSQL with encryption, backups, and Multi-AZ support
- Secure S3 remote state with native locking (Terraform 1.11+)
- Full CI/CD pipeline via GitHub Actions with OIDC authentication (no long-lived AWS credentials)

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
3. Deploy infrastructure in stages:
   - **Stage 4a**: Bootstrap + Networking (~2 minutes)
   - **Stage 4b**: Database/RDS (~5-10 minutes)
   - **Stage 4c**: Compute/ECS (~3 minutes)
   - **Stage 4d**: Final synchronization
4. Store state in S3 with automatic locking

**Note:** RDS creation takes 5-10 minutes. This is normal AWS behavior - do not interrupt!

### 4. Enable Additional Modules

Edit `terraform.tfvars` to enable modules progressively:

```hcl
enable_networking    = true  # Enable VPC and networking
enable_eks           = true  # Enable EKS cluster and node groups
enable_ingress       = true  # Enable ALB controller, ACM, Route 53
enable_observability = true  # Enable Grafana, Loki, Tempo, Prometheus
enable_database      = true  # Enable RDS PostgreSQL
```

Then deploy:
```bash
./deploy.sh  # Automatically handles staged deployment
```

**Deployment Time Estimates:**
- Networking only: ~2 minutes
- Networking + Compute: ~5 minutes
- Full stack (Networking + Database + Compute): ~12-15 minutes

---

## CI/CD Setup

All four workflows authenticate to AWS via **GitHub Actions OIDC** — no long-lived AWS access keys are stored as secrets. The OIDC provider and GitHub Actions IAM role are provisioned by `module.bootstrap`.

### Step 1 — Bootstrap OIDC

Bootstrap must be applied locally before the pipelines can run. This creates the OIDC provider, the GitHub Actions IAM role, and the Terraform state bucket.

```bash
# Apply bootstrap only
terraform apply -target=module.bootstrap

# Retrieve the IAM role ARN to configure as a secret
terraform output -raw bootstrap_github_actions_role_arn
```

### Step 2 — Configure GitHub Secrets

Go to **Settings → Secrets and variables → Actions → New repository secret** and add each of the following:

| Secret | Description | How to get the value |
|--------|-------------|----------------------|
| `AWS_GITHUB_ACTIONS_ROLE_ARN` | IAM role ARN that GitHub Actions assumes via OIDC | `terraform output -raw bootstrap_github_actions_role_arn` |
| `AWS_REGION` | AWS region for all workflows | The `region` value from your `terraform.tfvars` (e.g. `us-east-1`) |
| `TF_VARS` | Full contents of your `terraform.tfvars` file | Copy the file contents: `cat terraform.tfvars` |
| `INFRACOST_API_KEY` | Infracost API key for cost estimation on PRs | [infracost.io/docs](https://www.infracost.io/docs/#2-get-api-key) |
| `ECR_REPOSITORY_URL` | ECR repository URI without tag | `terraform output -raw ecr_repository_url` (after compute module applied) |
| `EKS_CLUSTER_NAME` | EKS cluster name | `terraform output -raw eks_cluster_name` (after EKS module applied) |
| `GRAFANA_API_KEY` | Grafana service account token for OTel trace verification | Grafana → Administration → Service accounts → New token |

### Step 3 — Create the `production` GitHub Environment

The infra pipeline's apply job and the destroy workflow both require manual approval via a **GitHub Environment** named `production`. Without this, applies run unattended after any push to `main`.

1. Go to **Settings → Environments → New environment**
2. Name it exactly `production`
3. Under **Deployment protection rules**, enable **Required reviewers**
4. Add yourself and any other approvers (minimum one reviewer required)
5. Optionally set a **Wait timer** (e.g. 5 minutes) as an additional safety buffer

### Step 4 — Configure Branch Protection

Go to **Settings → Branches → Add branch protection rule** for `main`:

| Rule | Setting |
|------|---------|
| Require a pull request before merging | Enabled |
| Require approvals | 1 (or more) |
| Require status checks to pass before merging | Enabled |
| Required status checks | `quality`, `plan` |
| Require branches to be up to date before merging | Enabled |
| Do not allow bypassing the above settings | Enabled |
| Allow force pushes | **Disabled** |
| Allow deletions | **Disabled** |

The `quality` and `plan` jobs from the infra pipeline run on every PR targeting `main`. With these checks required, a PR cannot be merged if Terraform formatting, validation, linting, or planning fails.

### Workflow Summary

| Workflow | File | Trigger | What it does |
|----------|------|---------|--------------|
| **App Pipeline** | `app.yml` | Push to `main` on `apps/order-api/**`; `workflow_dispatch` | Unit tests → manifest validation → Docker build+push to ECR → Trivy image scan → deploy to EKS with automatic rollback → integration tests (health, orders, metrics, Tempo traces) |
| **Infra Pipeline** | `infra.yml` | Push or PR to `main` on `*.tf` / `modules/**`; `workflow_dispatch` | fmt/validate/lint/tfsec → cost diff (PR only) → `terraform plan` → security scan + manifest validation → manual approval gate (`production` env) → staged `terraform apply` |
| **Destroy Infrastructure** | `destroy.yml` | `workflow_dispatch` only | Double-gated full teardown: typed confirmation + `production` environment approval → empty S3 data buckets → disable modules in order → destroy bootstrap → delete state bucket |
| **Drift Detection** | `drift-detection.yml` | Nightly at 02:00 UTC; `workflow_dispatch` | Runs `terraform plan -detailed-exitcode`; opens a GitHub issue labeled `drift` if changes detected; closes the issue automatically when drift is resolved |

### Using the Destroy Workflow Safely

The destroy workflow is intentionally hard to trigger accidentally. It requires **both** gates to pass before any AWS resource is touched:

1. **GitHub Environment approval** — a configured reviewer must approve the `destroy` job in the `production` environment (same gate as infra apply)
2. **Typed confirmation** — the `confirm` input must be the exact string `destroy-everything`

To trigger a destroy:

1. Go to **Actions → Destroy Infrastructure → Run workflow**
2. Set `confirm` to `destroy-everything` (copy-paste to avoid typos)
3. Select the target environment (`dev`, `staging`, or `prod`)
4. Click **Run workflow**
5. When the job reaches the approval gate, a reviewer must click **Review deployments → Approve**

The workflow destroys resources in dependency order:
1. Empties Loki and Tempo S3 buckets (handles versioned and Glacier-transitioned objects)
2. Disables observability → ingress → database → EKS → networking (each as a separate `terraform apply`)
3. Destroys bootstrap resources (KMS key, OIDC provider, IAM roles) via `destroy_all = true`
4. Empties and deletes the Terraform state bucket

> **Note:** The state bucket is created outside Terraform by `create-s3-bucket.sh`, so it must be deleted explicitly. After the destroy workflow completes, nothing remains in AWS.

### Drift Detection

The drift detection workflow runs every night at 02:00 UTC and compares live AWS infrastructure against Terraform state using `terraform plan -detailed-exitcode`.

| Exit code | Meaning | Action taken |
|-----------|---------|--------------|
| `0` | No changes — infrastructure matches state | Closes any open `drift` issue with a "resolved" comment |
| `1` | Terraform error (plan failed) | Fails the workflow run; no issue action |
| `2` | Drift detected — live state differs from Terraform | Opens a new `drift` issue (or comments on the existing one) with the full plan output |

**When a drift issue is opened:**

1. Open the issue and review the plan output in the details block
2. Determine whether the change was intentional (someone applied a manual change) or unintentional (resource modified or deleted outside Terraform)
3. **If intentional:** import the resource into state (`terraform import`) or update the Terraform config to match, then apply
4. **If unintentional:** run `terraform apply` to restore the intended state
5. The next nightly run will automatically close the issue once `terraform plan` returns exit code 0

The `drift` label is created automatically on first run if it does not exist in the repository.

---

## Project Structure

```
CloudOps/
├── main.tf                    # Root configuration
├── provider.tf                # AWS provider + backend config
├── variables.tf               # Variable definitions
├── outputs.tf                 # Output definitions
├── terraform.tfvars           # Your configuration values
├── deploy.sh                  # Automated deployment script
├── destroy.sh                 # Infrastructure teardown script
├── .github/
│   └── workflows/
│       ├── app.yml            # App CI/CD pipeline
│       ├── infra.yml          # Infrastructure CI/CD pipeline
│       ├── destroy.yml        # Manual destroy workflow
│       └── drift-detection.yml# Nightly drift detection
└── modules/
    ├── bootstrap/             # S3 state bucket + IAM deployer role + GitHub OIDC
    │   ├── iam.tf
    │   ├── github_oidc.tf
    │   ├── kms.tf
    │   ├── locals.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── networking/            # VPC, subnets, security groups, flow logs
    │   ├── vpc.tf
    │   ├── subnets.tf
    │   ├── nat_gateway.tf
    │   ├── route_tables.tf
    │   ├── flow_logs.tf
    │   ├── security_groups.tf
    │   ├── locals.tf
    │   ├── variables.tf
    │   └── outputs.tf
    ├── compute/               # ECS Fargate, ALB, autoscaling, ECR
    │   ├── alb.tf
    │   ├── autoscaling.tf
    │   ├── ecr.tf
    │   ├── ecs_cluster.tf
    │   ├── ecs_service.tf
    │   ├── iam.tf
    │   ├── task_definition.tf
    │   ├── locals.tf
    │   ├── variables.tf
    │   └── outputs.tf
    └── database/              # RDS PostgreSQL, Secrets Manager
        ├── main.tf
        ├── variables.tf
        └── outputs.tf
```

## Module Toggle System

Control which modules are deployed via `terraform.tfvars`:

```hcl
enable_networking    = false  # VPC, subnets, security groups
enable_eks           = false  # EKS cluster and node groups
enable_ingress       = false  # ALB controller, ACM cert, Route 53
enable_observability = false  # Grafana, Loki, Tempo, Prometheus
enable_database      = false  # RDS PostgreSQL
destroy_all          = false  # DANGER: destroys bootstrap (set others false first)
```

## What Gets Created

### Bootstrap Module
- S3 bucket for Terraform state (encrypted, versioned)
- KMS key for encryption (optional)
- IAM deployer role with infrastructure permissions
- GitHub Actions OIDC provider and federated IAM role (no long-lived credentials needed)

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

### Database Module
- RDS PostgreSQL instance with encryption at rest
- AWS Secrets Manager for credential management
- Multi-AZ deployment for automatic failover (optional)
- Read replica for disaster recovery (optional)
- Automated backups with point-in-time recovery
- CloudWatch monitoring and alarms
- Enhanced monitoring and Performance Insights
- IAM integration with ECS tasks

## Security Features

- S3 state encryption with versioning
- S3 native state locking (no DynamoDB needed)
- Public access blocking on state bucket
- IAM deployer role with least-privilege
- GitHub Actions OIDC — no AWS access keys stored in GitHub
- OIDC trust scoped to this repository's `main`, `feature/*` branches and pull requests only
- Security groups with minimal required access
- KMS encryption for additional security
- VPC Flow Logs for network monitoring
- Trivy scanning on both Terraform config (infra pipeline) and container images (app pipeline)
- Checkov policy checks on every infra PR

## Infrastructure Teardown

**Preferred: use the destroy workflow** (see [CI/CD Setup — Using the Destroy Workflow Safely](#using-the-destroy-workflow-safely) above). It handles versioned S3 objects, Glacier-transitioned objects, and progressive module disabling automatically.

**Manual teardown:**

```bash
./destroy.sh
```

Or step by step:

```bash
# 1. Disable modules progressively (edit terraform.tfvars before each apply)
enable_observability = false
terraform apply

enable_ingress = false
terraform apply

enable_database = false
terraform apply

enable_eks = false
terraform apply

enable_networking = false
terraform apply

# 2. Destroy bootstrap (OIDC provider, IAM roles, KMS key, state bucket config)
destroy_all = true
terraform apply

# 3. Delete S3 state bucket manually (created outside Terraform)
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

# Database (cost-optimized)
database_instance_class        = "db.t3.micro"
database_multi_az              = false
database_create_read_replica   = false
database_backup_retention_period = 7
```

### Production Environment

```hcl
environment        = "prod"
enable_nat_gateway = true   # High availability
enable_flow_logs   = true
desired_count      = 3
cpu                = "1024"
memory             = "2048"

# Database (resilience-optimized)
database_instance_class        = "db.r6g.large"
database_multi_az              = true
database_create_read_replica   = true
database_backup_retention_period = 30
database_deletion_protection     = true
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

### GitHub Actions OIDC Failure

If workflows fail with `Error assuming role` or `No OpenIDConnect provider found`:

1. Confirm bootstrap has been applied: `terraform state list | grep bootstrap`
2. Confirm the `AWS_GITHUB_ACTIONS_ROLE_ARN` secret matches the output: `terraform output -raw bootstrap_github_actions_role_arn`
3. Confirm the branch or event type is in the OIDC trust policy (`main`, `feature/*`, or `pull_request`)
4. Confirm `id-token: write` permission is set on the job (required for OIDC token generation)

### Drift Issue Opened — What to Do

See [Drift Detection](#drift-detection) above for a full remediation guide. Quick steps:

1. Open the drift issue and read the plan output
2. Run `terraform plan` locally to reproduce
3. If unintentional: run `terraform apply` to restore intended state
4. If intentional: update the Terraform config or run `terraform import` to record the change
5. The issue closes automatically on the next nightly run once `terraform plan` returns no changes

## Support

- AWS Provider Documentation: https://registry.terraform.io/providers/hashicorp/aws/latest/docs
- Terraform Documentation: https://www.terraform.io/docs

## License

Internal use only - Proprietary
