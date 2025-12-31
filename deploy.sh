#!/bin/bash
# CloudOps Deployment Script
# Creates S3 bucket, builds Docker image (if compute enabled), deploys infrastructure

set -e

echo "=========================================="
echo "   CloudOps Infrastructure Deployment"
echo "=========================================="
echo ""

# Check if Terraform is installed
if ! command -v terraform &> /dev/null; then
    echo "Error: Terraform is not installed"
    exit 1
fi

# Step 1: Create S3 bucket for remote state
echo "Step 1: Creating S3 bucket for Terraform state"
echo "==============================================="
bash ./modules/bootstrap/create-s3-bucket.sh

if [ $? -ne 0 ]; then
    echo "Error: Failed to create S3 bucket"
    exit 1
fi

# Step 2: Initialize Terraform (creates ECR if compute enabled)
echo ""
echo "Step 2: Initializing Terraform"
echo "=============================="
terraform init

# Check if this is first deployment (ECR might not exist yet)
ENABLE_COMPUTE=$(grep '^enable_compute' terraform.tfvars | sed 's/.*=\s*\([a-z]*\).*/\1/')

if [ "$ENABLE_COMPUTE" = "true" ]; then
    echo ""
    echo "Compute module is enabled. Checking ECR repository..."

    # Run terraform apply to create ECR first (if needed)
    terraform apply -target=module.compute[0].aws_ecr_repository.main -auto-approve 2>/dev/null || true

    # Step 3: Build and push Docker image
    echo ""
    echo "Step 3: Building and pushing Order API to ECR"
    echo "=============================================="
    bash ./scripts/build-and-push.sh

    if [ $? -ne 0 ]; then
        echo "Warning: Docker build/push failed or skipped"
        echo "Continuing with Terraform deployment..."
    fi
fi

# Step 4: Deploy full infrastructure
echo ""
echo "Step 4: Deploying infrastructure"
echo "================================"
terraform apply -auto-approve

echo ""
echo "=========================================="
echo "   Deployment Complete!"
echo "=========================================="
echo ""
