#!/bin/bash
# Build and push Order API to ECR
# Called by deploy.sh before terraform apply when compute module is enabled

set -e

echo "=========================================="
echo "Building and Pushing Order API to ECR"
echo "=========================================="

# Get configuration from terraform.tfvars
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
TFVARS_FILE="$ROOT_DIR/terraform.tfvars"

if [ ! -f "$TFVARS_FILE" ]; then
    echo "Error: terraform.tfvars not found at $TFVARS_FILE"
    exit 1
fi

# Extract variables
REGION=$(grep '^region' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)".*/\1/')
PROJECT_NAME=$(grep '^project_name' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)".*/\1/')
ENVIRONMENT=$(grep '^environment' "$TFVARS_FILE" | sed 's/.*=\s*"\(.*\)".*/\1/')
ENABLE_COMPUTE=$(grep '^enable_compute' "$TFVARS_FILE" | sed 's/.*=\s*\([a-z]*\).*/\1/')

# Check if compute is enabled
if [ "$ENABLE_COMPUTE" != "true" ]; then
    echo "Compute module is disabled. Skipping Docker build and push."
    exit 0
fi

echo "Configuration:"
echo "  Project:     $PROJECT_NAME"
echo "  Environment: $ENVIRONMENT"
echo "  Region:      $REGION"
echo ""

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed"
    exit 1
fi

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

# Get ECR repository name
ECR_REPO_NAME="${PROJECT_NAME}-${ENVIRONMENT}-app"

# Check if ECR repository exists
echo "Checking if ECR repository exists: $ECR_REPO_NAME"
if ! aws ecr describe-repositories --repository-names "$ECR_REPO_NAME" --region "$REGION" &> /dev/null; then
    echo "Warning: ECR repository '$ECR_REPO_NAME' does not exist yet."
    echo "This is expected on first deployment. Terraform will create it."
    echo "Please run this script again after 'terraform apply' creates the ECR repository."
    exit 0
fi

# Get ECR repository URI
ECR_URI=$(aws ecr describe-repositories \
    --repository-names "$ECR_REPO_NAME" \
    --region "$REGION" \
    --query 'repositories[0].repositoryUri' \
    --output text)

echo "ECR Repository: $ECR_URI"
echo ""

# Generate version tag (timestamp-based)
VERSION_TAG="v$(date +%Y%m%d-%H%M%S)"
echo "Image Version: $VERSION_TAG"
echo ""

# Login to ECR
echo "Logging in to ECR..."
aws ecr get-login-password --region "$REGION" | \
    docker login --username AWS --password-stdin "$ECR_URI" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "Error: Failed to login to ECR"
    exit 1
fi

echo "ECR login successful"
echo ""

# Build Docker image
APP_DIR="$ROOT_DIR/apps/order-api"

if [ ! -d "$APP_DIR" ]; then
    echo "Error: Order API directory not found at $APP_DIR"
    exit 1
fi

echo "Building Docker image..."
echo "  Source: $APP_DIR"
echo "  Tag: order-api:$VERSION_TAG"
echo ""

cd "$APP_DIR"
docker build -t "order-api:$VERSION_TAG" -t "order-api:latest" .

if [ $? -ne 0 ]; then
    echo "Error: Docker build failed"
    exit 1
fi

echo ""
echo "Docker build successful"
echo ""

# Tag for ECR
echo "Tagging image for ECR..."
docker tag "order-api:$VERSION_TAG" "$ECR_URI:$VERSION_TAG"
docker tag "order-api:$VERSION_TAG" "$ECR_URI:latest"

# Push to ECR
echo "Pushing to ECR..."
echo "  $ECR_URI:$VERSION_TAG"
echo "  $ECR_URI:latest"
echo ""

docker push "$ECR_URI:$VERSION_TAG"
docker push "$ECR_URI:latest"

if [ $? -ne 0 ]; then
    echo "Error: Docker push failed"
    exit 1
fi

echo ""
echo "=========================================="
echo "Build and Push Complete!"
echo "=========================================="
echo "Image: $ECR_URI:$VERSION_TAG"
echo ""

# Update terraform.tfvars with new image
echo "Updating terraform.tfvars with new image..."

# Create temporary file
TMP_FILE=$(mktemp)

# Update container_image line
sed "s|^container_image = .*|container_image = \"$ECR_URI:$VERSION_TAG\"|" "$TFVARS_FILE" > "$TMP_FILE"

# Replace original file
mv "$TMP_FILE" "$TFVARS_FILE"

echo "Updated container_image in terraform.tfvars"
echo ""
echo "Next: Terraform will deploy this image to ECS"
echo ""
