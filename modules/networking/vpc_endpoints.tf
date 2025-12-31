# VPC Endpoints for Private Subnet Access to AWS Services
# Enables ECS tasks in private subnets to pull images from ECR without NAT Gateway
#
# Architecture Rationale:
# - ECS Fargate tasks in private subnets need to pull container images from ECR
# - ECR requires access to three endpoints:
#   1. ecr.api - ECR API for authentication and image metadata
#   2. ecr.dkr - Docker registry endpoint for pulling image layers
#   3. s3 - Amazon S3 where ECR stores image layers
# - Using VPC endpoints instead of NAT Gateway provides:
#   - Lower cost (no hourly NAT charges)
#   - Better security (traffic never leaves AWS network)
#   - Controlled access via security groups
#   - Production-grade architecture for regulated environments

# ECR API Interface Endpoint
# Required for ECS to authenticate with ECR and retrieve image manifests
resource "aws_vpc_endpoint" "ecr_api" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.api"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-ecr-api-endpoint"
    }
  )
}

# ECR Docker Registry Interface Endpoint
# Required for ECS to pull Docker image layers from ECR
resource "aws_vpc_endpoint" "ecr_dkr" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.ecr.dkr"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-ecr-dkr-endpoint"
    }
  )
}

# S3 Gateway Endpoint
# Required because ECR stores Docker image layers in S3
# Gateway endpoints are free and don't require security groups
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${data.aws_region.current.name}.s3"
  vpc_endpoint_type = "Gateway"

  # Associate with private route tables so ECS tasks can reach S3
  route_table_ids = aws_route_table.private[*].id

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-s3-endpoint"
    }
  )
}

# CloudWatch Logs Interface Endpoint (Optional but recommended)
# Allows ECS tasks to send logs to CloudWatch without NAT Gateway
# This is best practice for production environments
resource "aws_vpc_endpoint" "logs" {
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${data.aws_region.current.name}.logs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = aws_subnet.private[*].id
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true

  tags = merge(
    local.common_tags,
    {
      Name = "${var.name_prefix}-logs-endpoint"
    }
  )
}

# VPC Endpoint Architecture Notes:
#
# Interface Endpoints (ecr.api, ecr.dkr, logs):
# - Create ENIs in private subnets with private IPs
# - private_dns_enabled=true creates private Route53 zone
# - DNS resolves service names (e.g., ecr.us-east-1.amazonaws.com) to private IPs
# - Traffic stays within AWS network, never traverses internet
# - Requires security group allowing HTTPS (port 443) from VPC
#
# Gateway Endpoints (s3):
# - Use route table entries instead of ENIs
# - Completely free (no hourly or data processing charges)
# - No security groups needed (uses IAM policies and S3 bucket policies)
# - Prefix list automatically added to route tables
#
# Cost Comparison (us-east-1):
# - NAT Gateway: ~$32/month + $0.045/GB data processed
# - Interface Endpoint: ~$7.20/month + $0.01/GB data processed
# - Gateway Endpoint: FREE
#
# Security Benefits:
# - Traffic never leaves AWS network
# - No internet gateway exposure
# - Granular control via security groups
# - Meets compliance requirements (PCI-DSS, HIPAA, FedRAMP)
#
# Production Recommendation:
# For production workloads, also consider adding endpoints for:
# - secretsmanager (if using Secrets Manager for env vars)
# - ssm (if using Parameter Store)
# - kms (if using customer-managed KMS keys)
# - sts (if using cross-account roles)
