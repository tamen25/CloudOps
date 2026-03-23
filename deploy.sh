#!/bin/bash
# CloudOps Deployment Script
# Deploy order: bootstrap → networking → eks → ingress → observability → database → final sync

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo "=========================================="
echo "   CloudOps Infrastructure Deployment"
echo "=========================================="
echo ""

# Validate dependencies
if ! command -v terraform &> /dev/null; then
    echo "Error: terraform not found in PATH"
    exit 1
fi
if ! command -v aws &> /dev/null; then
    echo "Error: aws CLI not found in PATH"
    exit 1
fi

# Read enabled modules from terraform.tfvars
get_tfvar_bool() {
    grep "^$1" terraform.tfvars 2>/dev/null | grep -o 'true\|false' | head -1
}

ENABLE_NETWORKING=$(get_tfvar_bool "enable_networking")
ENABLE_EKS=$(get_tfvar_bool "enable_eks")
ENABLE_DATABASE=$(get_tfvar_bool "enable_database")
ENABLE_INGRESS=$(get_tfvar_bool "enable_ingress")
ENABLE_OBSERVABILITY=$(get_tfvar_bool "enable_observability")

echo "Enabled modules:"
echo "  networking    = ${ENABLE_NETWORKING:-false}"
echo "  eks           = ${ENABLE_EKS:-false}"
echo "  database      = ${ENABLE_DATABASE:-false}"
echo "  ingress       = ${ENABLE_INGRESS:-false}"
echo "  observability = ${ENABLE_OBSERVABILITY:-false}"
echo ""

# ---------------------------------------------------------------------------
# Step 1: S3 bucket for Terraform remote state (idempotent)
# ---------------------------------------------------------------------------
echo "Step 1: Ensuring Terraform state S3 bucket exists"
echo "=================================================="
bash ./modules/bootstrap/create-s3-bucket.sh
echo ""

# ---------------------------------------------------------------------------
# Step 2: Terraform init
# ---------------------------------------------------------------------------
echo "Step 2: Initializing Terraform"
echo "=============================="
terraform init
echo ""

# ---------------------------------------------------------------------------
# Step 3: Bootstrap + Networking
# ---------------------------------------------------------------------------
if [ "$ENABLE_NETWORKING" = "true" ]; then
    echo "Step 3: Deploying Bootstrap + Networking (~2 minutes)"
    echo "======================================================"
    terraform apply -target=module.bootstrap -target=module.networking -auto-approve
    echo -e "${GREEN}✓ Bootstrap + Networking deployed${NC}"
    echo ""
else
    echo "Step 3: Deploying Bootstrap only"
    echo "================================="
    terraform apply -target=module.bootstrap -auto-approve
    echo -e "${GREEN}✓ Bootstrap deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 4: EKS cluster (~15 minutes)
# ---------------------------------------------------------------------------
if [ "$ENABLE_EKS" = "true" ]; then
    echo "Step 4: Deploying EKS cluster (~15 minutes, please wait)"
    echo "========================================================="
    echo -e "${YELLOW}⏳ EKS cluster creation is slow. Do not interrupt!${NC}"
    terraform apply -target=module.eks -auto-approve
    echo -e "${GREEN}✓ EKS cluster deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 5: Ingress (ACM + Route 53 + AWS Load Balancer Controller)
# Requires EKS cluster to be running first.
# ---------------------------------------------------------------------------
if [ "$ENABLE_INGRESS" = "true" ]; then
    echo "Step 5: Deploying Ingress (ACM + LBC + Route 53)"
    echo "=================================================="
    terraform apply -target=module.ingress -auto-approve
    echo -e "${GREEN}✓ Ingress deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 6: Observability (LGTM stack)
# Requires EKS + Ingress (for ACM cert ARN).
# ---------------------------------------------------------------------------
if [ "$ENABLE_OBSERVABILITY" = "true" ]; then
    echo "Step 6: Deploying Observability stack (~10 minutes)"
    echo "===================================================="
    echo -e "${YELLOW}⏳ Helm releases for Loki, Tempo, Prometheus, OTel Collector, Grafana${NC}"
    terraform apply -target=module.observability -auto-approve
    echo -e "${GREEN}✓ Observability stack deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 7: Database (RDS takes 5-10 minutes)
# ---------------------------------------------------------------------------
if [ "$ENABLE_DATABASE" = "true" ]; then
    echo "Step 7: Deploying Database (RDS ~5-10 minutes)"
    echo "==============================================="
    echo -e "${YELLOW}⏳ RDS creation is slow. Do not interrupt!${NC}"
    terraform apply -target=module.database -auto-approve
    echo -e "${GREEN}✓ Database deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 8: Final synchronization (catches any inter-module dependencies)
# ---------------------------------------------------------------------------
echo "Step 8: Final synchronization"
echo "=============================="
terraform apply -auto-approve
echo -e "${GREEN}✓ All resources in sync${NC}"
echo ""

# ---------------------------------------------------------------------------
# Deployment summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}${CYAN}║              CloudOps Deployment Summary                     ║${NC}"
echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"

ORDER_API_URL="https://api.tamendutta.com"
printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Order API:" "$ORDER_API_URL"

if [ "$ENABLE_INGRESS" = "true" ]; then
    ACM_ARN=$(terraform output -raw acm_certificate_arn 2>/dev/null || echo "(pending)")
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "ACM Certificate ARN:" "$ACM_ARN"
fi

if [ "$ENABLE_DATABASE" = "true" ]; then
    DB_ENDPOINT=$(terraform output -raw database_endpoint 2>/dev/null || echo "(pending)")
    DB_SECRET=$(terraform output -raw database_secret_arn 2>/dev/null || echo "(pending)")
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Database Endpoint:" "$DB_ENDPOINT"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "DB Secret ARN:" "$DB_SECRET"
fi

if [ "$ENABLE_OBSERVABILITY" = "true" ]; then
    GRAFANA_URL=$(terraform output -raw grafana_url 2>/dev/null || echo "(pending)")
    GRAFANA_PASS=$(terraform output -raw grafana_admin_password 2>/dev/null || echo "(error retrieving)")
    OTEL_URL=$(terraform output -raw otel_endpoint 2>/dev/null || echo "(pending)")
    OTEL_KEY=$(terraform output -raw otel_api_key 2>/dev/null || echo "(error retrieving)")

    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Grafana URL:" "$GRAFANA_URL"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s  ${YELLOW}[SENSITIVE]${NC}\n" "Grafana Password:" "$GRAFANA_PASS"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "OTel Endpoint:" "$OTEL_URL"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s  ${YELLOW}[SENSITIVE]${NC}\n" "OTel API Key:" "$OTEL_KEY"
fi

echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ "$ENABLE_OBSERVABILITY" = "true" ]; then
    echo -e "${YELLOW}⚠  SENSITIVE values printed above — store them securely now.${NC}"
    echo -e "${YELLOW}   They will not be displayed again without running terraform output.${NC}"
    echo ""
fi

if [ "$ENABLE_INGRESS" = "true" ]; then
    echo "Next step: set alb_dns_name and alb_zone_id in terraform.tfvars"
    echo "  1. kubectl get ingress -n cloudops  (to find the ALB DNS name)"
    echo "  2. Update alb_dns_name and alb_zone_id in terraform.tfvars"
    echo "  3. Run terraform apply to create Route 53 DNS records"
    echo ""
fi

echo -e "${GREEN}✓ Deployment complete!${NC}"
echo ""
