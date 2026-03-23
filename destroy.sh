#!/bin/bash
# CloudOps Complete Infrastructure Teardown Script
# Safely destroys all infrastructure including observability S3 buckets and state bucket

set -e

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

# Validate dependencies
if ! command -v aws &> /dev/null; then
    echo "Error: aws CLI not found in PATH"
    exit 1
fi
if ! command -v terraform &> /dev/null; then
    echo "Error: terraform not found in PATH"
    exit 1
fi

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Read values from terraform.tfvars
get_tfvar() {
    local var_name=$1
    grep "^$var_name" terraform.tfvars 2>/dev/null | sed 's/.*=\s*"\(.*\)"/\1/' | tr -d ' "'
}

REGION=$(get_tfvar "region")
ENVIRONMENT=$(get_tfvar "environment")
PROJECT_NAME=$(get_tfvar "project_name")
BUCKET_NAME=$(get_tfvar "bootstrap_bucket_name")

if [ -z "$BUCKET_NAME" ]; then
    BUCKET_NAME="${PROJECT_NAME}-tfstate-bucket"
fi

# Resolve AWS account ID for observability bucket names
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "")
LOKI_BUCKET="cloudops-loki-chunks-${ACCOUNT_ID}"
TEMPO_BUCKET="cloudops-tempo-traces-${ACCOUNT_ID}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Project:      $PROJECT_NAME"
echo "  Region:       $REGION"
echo "  Environment:  $ENVIRONMENT"
echo "  State bucket: $BUCKET_NAME"
echo "  Loki bucket:  $LOKI_BUCKET"
echo "  Tempo bucket: $TEMPO_BUCKET"
echo ""

echo -e "${RED}This will:${NC}"
echo "  1. Empty and delete Loki + Tempo S3 buckets (observability data)"
echo "  2. Destroy all Terraform-managed infrastructure"
echo "  3. Delete the Terraform state S3 bucket: $BUCKET_NAME"
echo "  4. Delete all state files and local Terraform artifacts"
echo ""
echo -e "${RED}THIS CANNOT BE UNDONE!${NC}"
echo ""
read -p "Type 'destroy-everything' to confirm: " -r
echo

if [[ "$REPLY" != "destroy-everything" ]]; then
    echo -e "${YELLOW}Destruction cancelled${NC}"
    exit 0
fi

# ---------------------------------------------------------------------------
# Helper: empty a versioned S3 bucket
# ---------------------------------------------------------------------------
empty_s3_bucket() {
    local bucket=$1
    if aws s3api head-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null; then
        echo "  Emptying $bucket..."

        # Delete all current objects
        aws s3 rm "s3://$bucket" --recursive --region "$REGION" 2>/dev/null || true

        # Delete all object versions (handles versioning and Glacier-transitioned objects)
        VERSIONS=$(aws s3api list-object-versions --bucket "$bucket" --region "$REGION" \
            --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
            --output json 2>/dev/null || echo '{"Objects":[]}')
        if echo "$VERSIONS" | grep -q '"Key"'; then
            aws s3api delete-objects --bucket "$bucket" --region "$REGION" \
                --delete "$VERSIONS" 2>/dev/null || true
        fi

        # Delete all delete markers
        MARKERS=$(aws s3api list-object-versions --bucket "$bucket" --region "$REGION" \
            --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
            --output json 2>/dev/null || echo '{"Objects":[]}')
        if echo "$MARKERS" | grep -q '"Key"'; then
            aws s3api delete-objects --bucket "$bucket" --region "$REGION" \
                --delete "$MARKERS" 2>/dev/null || true
        fi

        echo -e "${GREEN}  ✓ $bucket emptied${NC}"
    else
        echo "  $bucket not found, skipping"
    fi
}

# ---------------------------------------------------------------------------
# Step 1: Empty Loki and Tempo observability buckets
# These buckets may contain Glacier-transitioned objects that block Terraform
# destroy even with force_destroy = true.
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 1: Emptying observability S3 buckets${NC}"
echo -e "${YELLOW}==========================================${NC}"

if [ -n "$ACCOUNT_ID" ]; then
    empty_s3_bucket "$LOKI_BUCKET"
    empty_s3_bucket "$TEMPO_BUCKET"
else
    echo -e "${YELLOW}⚠ Could not determine AWS account ID — skipping observability bucket empty${NC}"
    echo "  You may need to empty cloudops-loki-chunks-* and cloudops-tempo-traces-* manually"
fi

# ---------------------------------------------------------------------------
# Step 2: Delete RDS instances FIRST (takes 5-10 minutes, blocks destroy)
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 2: Deleting RDS instances (if any)${NC}"
echo -e "${YELLOW}========================================${NC}"

RDS_INSTANCE="${PROJECT_NAME}-db-primary"
if aws rds describe-db-instances --db-instance-identifier "$RDS_INSTANCE" --region "$REGION" 2>/dev/null | grep -q "$RDS_INSTANCE"; then
    echo "Deleting RDS instance: $RDS_INSTANCE (this takes 5-10 minutes)..."
    aws rds delete-db-instance \
        --db-instance-identifier "$RDS_INSTANCE" \
        --skip-final-snapshot \
        --region "$REGION" 2>/dev/null || true

    echo "Waiting for RDS deletion to complete..."
    WAIT_COUNT=0
    MAX_WAIT=30  # 30 × 30s = 15 minutes max
    while [ $WAIT_COUNT -lt $MAX_WAIT ]; do
        if ! aws rds describe-db-instances \
                --db-instance-identifier "$RDS_INSTANCE" \
                --region "$REGION" 2>&1 | grep -q "$RDS_INSTANCE"; then
            echo -e "${GREEN}✓ RDS instance deleted${NC}"
            break
        fi
        echo "  Still deleting... ($WAIT_COUNT/$MAX_WAIT checks)"
        sleep 30
        WAIT_COUNT=$((WAIT_COUNT + 1))
    done

    if [ $WAIT_COUNT -eq $MAX_WAIT ]; then
        echo -e "${YELLOW}⚠ RDS taking longer than expected, continuing anyway${NC}"
    fi
else
    echo -e "${YELLOW}No RDS instance found, skipping${NC}"
fi

# ---------------------------------------------------------------------------
# Step 3: Disable all modules via Terraform apply before full destroy
# Reduces time and avoids dependency-ordering issues during terraform destroy
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 3: Disabling all modules${NC}"
echo -e "${YELLOW}==============================${NC}"

cp terraform.tfvars terraform.tfvars.backup

# Disable in reverse dependency order: observability → ingress → database → eks → networking
sed -i 's/^enable_observability = true/enable_observability = false/' terraform.tfvars
sed -i 's/^enable_ingress       = true/enable_ingress       = false/' terraform.tfvars
sed -i 's/^enable_ingress = true/enable_ingress = false/'             terraform.tfvars
sed -i 's/^enable_database = true/enable_database = false/'           terraform.tfvars
sed -i 's/^enable_eks = true/enable_eks = false/'                     terraform.tfvars
sed -i 's/^enable_networking = true/enable_networking = false/'       terraform.tfvars

terraform apply -auto-approve
echo -e "${GREEN}✓ Modules disabled${NC}"

# ---------------------------------------------------------------------------
# Step 4: Destroy bootstrap (KMS key, IAM deployer role)
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 4: Destroying bootstrap infrastructure${NC}"
echo -e "${YELLOW}============================================${NC}"

sed -i 's/^destroy_all = false/destroy_all = true/' terraform.tfvars
terraform apply -auto-approve
echo -e "${GREEN}✓ Bootstrap infrastructure destroyed${NC}"

# ---------------------------------------------------------------------------
# Step 5: Delete Terraform state S3 bucket
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 5: Deleting Terraform state S3 bucket${NC}"
echo -e "${YELLOW}==========================================${NC}"

if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
    echo "Emptying state bucket: $BUCKET_NAME"

    aws s3 rm "s3://$BUCKET_NAME" --recursive --region "$REGION" 2>/dev/null || true

    VERSIONS=$(aws s3api list-object-versions --bucket "$BUCKET_NAME" --region "$REGION" \
        --query '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
        --output json 2>/dev/null || echo '{"Objects":[]}')
    if echo "$VERSIONS" | grep -q '"Key"'; then
        aws s3api delete-objects --bucket "$BUCKET_NAME" --region "$REGION" \
            --delete "$VERSIONS" 2>/dev/null || true
    fi

    MARKERS=$(aws s3api list-object-versions --bucket "$BUCKET_NAME" --region "$REGION" \
        --query '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}' \
        --output json 2>/dev/null || echo '{"Objects":[]}')
    if echo "$MARKERS" | grep -q '"Key"'; then
        aws s3api delete-objects --bucket "$BUCKET_NAME" --region "$REGION" \
            --delete "$MARKERS" 2>/dev/null || true
    fi

    aws s3api delete-bucket --bucket "$BUCKET_NAME" --region "$REGION"
    echo -e "${GREEN}✓ State bucket deleted${NC}"
else
    echo -e "${YELLOW}State bucket not found, skipping${NC}"
fi

# ---------------------------------------------------------------------------
# Step 6: Clean up local Terraform artifacts
# ---------------------------------------------------------------------------
echo ""
echo -e "${YELLOW}Step 6: Cleaning up local files${NC}"
echo -e "${YELLOW}================================${NC}"

rm -f terraform.tfstate terraform.tfstate.backup tfplan
rm -rf .terraform
rm -f .terraform.lock.hcl

# Restore tfvars (backup has original module toggles)
mv terraform.tfvars.backup terraform.tfvars

echo -e "${GREEN}✓ Local files cleaned${NC}"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Complete Teardown Finished!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "All infrastructure has been destroyed."
echo "Run ./deploy.sh to start fresh."
echo ""
