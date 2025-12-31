#!/bin/bash
# Creates S3 bucket for Terraform state storage
# Reads configuration from terraform.tfvars

set -e

echo "=========================================="
echo "Creating S3 Bucket for Terraform State"
echo "=========================================="

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Get values from terraform.tfvars
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
TFVARS_FILE="$ROOT_DIR/terraform.tfvars"

if [ ! -f "$TFVARS_FILE" ]; then
    echo "Error: terraform.tfvars not found at $TFVARS_FILE"
    exit 1
fi

# Extract variables from terraform.tfvars (simple grep/sed, no jq needed)
REGION=$(grep '^region' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
PROJECT_NAME=$(grep '^project_name' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')
BUCKET_NAME=$(grep '^bootstrap_bucket_name' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)"/\1/')

# Generate bucket name if not provided
if [ -z "$BUCKET_NAME" ] || [ "$BUCKET_NAME" == '""' ] || [ "$BUCKET_NAME" == "" ]; then
    BUCKET_NAME="${PROJECT_NAME}-tfstate-bucket"
    echo "Warning: Using default bucket name. May fail if already taken."
fi

echo "Configuration:"
echo "  Project: $PROJECT_NAME"
echo "  Region:  $REGION"
echo "  Bucket:  $BUCKET_NAME"
echo ""

# Check if bucket already exists
if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
    echo "Bucket '$BUCKET_NAME' already exists. Skipping creation."
    exit 0
fi

# Create S3 bucket
echo "Creating bucket: $BUCKET_NAME in region: $REGION"

# Use AWS S3 MB command which handles regions automatically
aws s3 mb "s3://$BUCKET_NAME" --region "$REGION"

# Enable versioning
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            },
            "BucketKeyEnabled": false
        }]
    }'

# Block public access
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --region "$REGION" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

echo ""
echo "=========================================="
echo "S3 Bucket Created Successfully!"
echo "=========================================="
echo "Bucket: $BUCKET_NAME"
echo "Region: $REGION"
echo ""
