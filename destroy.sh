#!/bin/bash
# CloudOps Complete Infrastructure Teardown Script
# Safely destroys all infrastructure including S3 bucket

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${RED}================================================${NC}"
echo -e "${RED}   CloudOps Infrastructure Destruction${NC}"
echo -e "${RED}================================================${NC}"
echo ""
echo -e "${RED}WARNING: This will destroy ALL infrastructure!${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Function to extract value from tfvars
get_tfvar() {
    local var_name=$1
    local value=$(grep "^$var_name" terraform.tfvars | sed 's/.*=\s*"\(.*\)"/\1/' | tr -d ' ')
    echo "$value"
}

# Read values from terraform.tfvars
REGION=$(get_tfvar "region" | tr -d '"')
ENVIRONMENT=$(get_tfvar "environment" | tr -d '"')
PROJECT_NAME=$(get_tfvar "project_name" | tr -d '"')
BUCKET_NAME=$(get_tfvar "bootstrap_bucket_name" | tr -d '"')

# Generate bucket name using project-tfstate-bucket format
if [ -z "$BUCKET_NAME" ]; then
    BUCKET_NAME="${PROJECT_NAME}-tfstate-bucket"
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "  Project: $PROJECT_NAME"
echo "  Region: $REGION"
echo "  Environment: $ENVIRONMENT"
echo "  S3 Bucket: $BUCKET_NAME"
echo ""

# Final confirmation
echo -e "${RED}This will:${NC}"
echo "  1. Destroy all Terraform-managed infrastructure"
echo "  2. Delete the S3 bucket: $BUCKET_NAME"
echo "  3. Delete all state files and versions"
echo ""
echo -e "${RED}THIS CANNOT BE UNDONE!${NC}"
echo ""
read -p "Type 'destroy-everything' to confirm: " -r
echo

if [[ "$REPLY" != "destroy-everything" ]]; then
    echo -e "${YELLOW}Destruction cancelled${NC}"
    exit 0
fi

# Step 1: Destroy networking and compute modules first
echo ""
echo -e "${YELLOW}Step 1: Checking for active modules${NC}"
echo -e "${YELLOW}====================================${NC}"

# Check if networking or compute is enabled
NETWORKING_ENABLED=$(grep "^enable_networking" terraform.tfvars | grep -o "true\|false")
COMPUTE_ENABLED=$(grep "^enable_compute" terraform.tfvars | grep -o "true\|false")

if [ "$NETWORKING_ENABLED" == "true" ] || [ "$COMPUTE_ENABLED" == "true" ]; then
    echo -e "${YELLOW}Active modules detected. Disabling them first...${NC}"

    # Backup original tfvars
    cp terraform.tfvars terraform.tfvars.backup

    # Disable modules
    sed -i 's/^enable_networking = true/enable_networking = false/' terraform.tfvars
    sed -i 's/^enable_compute = true/enable_compute = false/' terraform.tfvars

    terraform apply -auto-approve

    echo -e "${GREEN}✓ Modules disabled${NC}"
fi

# Step 2: Delete ECR images BEFORE Terraform destroy
echo ""
echo -e "${YELLOW}Step 2: Deleting ECR repository and images${NC}"
echo -e "${YELLOW}===========================================${NC}"

ECR_REPO_NAME="${PROJECT_NAME}-${ENVIRONMENT}-app"

if aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" 2>/dev/null; then
    echo "Deleting ECR repository: $ECR_REPO_NAME"
    aws ecr delete-repository --repository-name "$ECR_REPO_NAME" --region "$REGION" --force
    echo -e "${GREEN}✓ ECR repository deleted${NC}"
else
    echo -e "${YELLOW}ECR repository does not exist, skipping${NC}"
fi

# Step 3: Enable destroy_all and destroy bootstrap
echo ""
echo -e "${YELLOW}Step 3: Destroying bootstrap infrastructure${NC}"
echo -e "${YELLOW}============================================${NC}"

# Set destroy_all = true
sed -i 's/^destroy_all = false/destroy_all = true/' terraform.tfvars

terraform apply -auto-approve

echo -e "${GREEN}✓ Bootstrap infrastructure destroyed${NC}"

# Step 4: Delete S3 bucket
echo ""
echo -e "${YELLOW}Step 4: Deleting S3 bucket and all versions${NC}"
echo -e "${YELLOW}===========================================${NC}"

# Check if bucket exists
if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
    echo "Emptying S3 bucket..."

    # Use s3 rm to delete all objects and versions (no jq needed)
    aws s3 rm "s3://$BUCKET_NAME" --recursive --region "$REGION" 2>/dev/null || true

    # Delete all versions using AWS CLI without jq
    aws s3api delete-objects --bucket "$BUCKET_NAME" --region "$REGION" \
        --delete "$(aws s3api list-object-versions --bucket "$BUCKET_NAME" --region "$REGION" \
        --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null || true

    # Delete all delete markers
    aws s3api delete-objects --bucket "$BUCKET_NAME" --region "$REGION" \
        --delete "$(aws s3api list-object-versions --bucket "$BUCKET_NAME" --region "$REGION" \
        --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' --output json)" 2>/dev/null || true

    # Delete the bucket
    aws s3api delete-bucket --bucket "$BUCKET_NAME" --region "$REGION"

    echo -e "${GREEN}✓ S3 bucket deleted${NC}"
else
    echo -e "${YELLOW}Bucket does not exist, skipping${NC}"
fi

# Step 5: Clean up local state files
echo ""
echo -e "${YELLOW}Step 5: Cleaning up local files${NC}"
echo -e "${YELLOW}================================${NC}"

rm -f terraform.tfstate terraform.tfstate.backup
rm -f tfplan
rm -rf .terraform
rm -f .terraform.lock.hcl

# Restore original tfvars or reset
if [ -f terraform.tfvars.backup ]; then
    mv terraform.tfvars.backup terraform.tfvars
else
    sed -i 's/^enable_networking = .*/enable_networking = false/' terraform.tfvars
    sed -i 's/^enable_compute = .*/enable_compute = false/' terraform.tfvars
    sed -i 's/^destroy_all = .*/destroy_all = false/' terraform.tfvars
fi

echo -e "${GREEN}✓ Local files cleaned${NC}"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Complete Teardown Finished!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "All infrastructure has been destroyed."
echo "You can run ./deploy.sh to start fresh."
echo ""
