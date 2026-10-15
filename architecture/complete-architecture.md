# CloudOps Complete Architecture Diagram

Create a complete AWS architecture across 2 availability zones (us-east-1a, us-east-1b).

## VPC: 10.0.0.0/16

### Availability Zone 1 (us-east-1a)

**Public Subnet (10.0.0.0/24)**:
- Internet Gateway
- Application Load Balancer
- NAT Gateway 1

**Private Subnet (10.0.10.0/24)**:
- ECS Fargate Tasks (2)
- Auto Scaling Group

**Database Subnet (10.0.20.0/24)**:
- RDS PostgreSQL Primary

### Availability Zone 2 (us-east-1b)

**Public Subnet (10.0.1.0/24)**:
- Application Load Balancer
- NAT Gateway 2

**Private Subnet (10.0.11.0/24)**:
- ECS Fargate Tasks (2)
- Auto Scaling Group

**Database Subnet (10.0.21.0/24)**:
- RDS PostgreSQL Standby

## External Services

- ECR Repository (container images)
- CloudWatch Logs
- Secrets Manager (database credentials)
- S3 (Terraform state)

## Traffic Flow

1. User → Internet → Internet Gateway → ALB
2. ALB → ECS Tasks (private subnets)
3. ECS Tasks → RDS Primary (database subnet)
4. RDS Primary ↔ RDS Standby (Multi-AZ replication)
5. ECS Tasks → Internet (via NAT Gateway → Internet Gateway)

## Security Groups

- **ALB SG**: Allow 80,443 from Internet
- **ECS SG**: Allow traffic from ALB only, allow 5432 to RDS
- **RDS SG**: Allow 5432 from ECS only
