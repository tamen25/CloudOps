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

# Step 4: Deploy infrastructure in stages (to handle RDS timing)
echo ""
echo "Step 4: Deploying infrastructure in stages"
echo "=========================================="

# Check which modules are enabled
ENABLE_NETWORKING=$(grep '^enable_networking' terraform.tfvars | sed 's/.*=\s*\([a-z]*\).*/\1/')
ENABLE_DATABASE=$(grep '^enable_database' terraform.tfvars | sed 's/.*=\s*\([a-z]*\).*/\1/')

# Stage 4a: Deploy Bootstrap + Networking first
if [ "$ENABLE_NETWORKING" = "true" ]; then
    echo ""
    echo "Stage 4a: Deploying Bootstrap + Networking (~2 minutes)"
    echo "-------------------------------------------------------"
    terraform apply -target=module.bootstrap -target=module.networking -auto-approve
    echo "✓ Networking deployed successfully"
fi

# Stage 4b: Deploy Database (takes 5-10 minutes)
if [ "$ENABLE_DATABASE" = "true" ]; then
    echo ""
    echo "Stage 4b: Deploying Database (RDS takes 5-10 minutes, please wait...)"
    echo "---------------------------------------------------------------------"
    echo "Creating RDS PostgreSQL instance..."
    echo "⏳ This is normal - RDS creation is slow. Do not interrupt!"
    echo ""

    terraform apply -target=module.database -auto-approve

    echo "✓ Database deployed successfully"
fi

# Stage 4c: Deploy Compute (ECS requires database to be ready)
if [ "$ENABLE_COMPUTE" = "true" ]; then
    echo ""
    echo "Stage 4c: Deploying Compute (ECS Fargate + ALB) (~3 minutes)"
    echo "------------------------------------------------------------"
    terraform apply -target=module.compute -auto-approve
    echo "✓ Compute deployed successfully"
fi

# Stage 4d: Final apply to ensure everything is in sync
echo ""
echo "Stage 4d: Final synchronization"
echo "-------------------------------"
terraform apply -auto-approve

echo ""
echo "=========================================="
echo "   ✓ Deployment Complete!"
echo "=========================================="
echo ""
