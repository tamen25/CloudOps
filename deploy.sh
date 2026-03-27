#!/bin/bash
# CloudOps Deployment Script
# Deploy order: bootstrap → networking → eks → ingress → observability → security → database → slo → final sync

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
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

get_tfvar_string() {
    grep "^$1" terraform.tfvars 2>/dev/null | sed 's/.*= *"\(.*\)".*/\1/' | head -1
}

ENABLE_NETWORKING=$(get_tfvar_bool "enable_networking")
ENABLE_EKS=$(get_tfvar_bool "enable_eks")
ENABLE_DATABASE=$(get_tfvar_bool "enable_database")
ENABLE_INGRESS=$(get_tfvar_bool "enable_ingress")
ENABLE_OBSERVABILITY=$(get_tfvar_bool "enable_observability")
ENABLE_SLO=$(get_tfvar_bool "enable_slo")
ENABLE_SECURITY=$(get_tfvar_bool "enable_security")

echo "Enabled modules:"
echo "  networking    = ${ENABLE_NETWORKING:-false}"
echo "  eks           = ${ENABLE_EKS:-false}"
echo "  database      = ${ENABLE_DATABASE:-false}"
echo "  ingress       = ${ENABLE_INGRESS:-false}"
echo "  observability = ${ENABLE_OBSERVABILITY:-false}"
echo "  slo           = ${ENABLE_SLO:-false}"
echo "  security      = ${ENABLE_SECURITY:-false}"
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
# Step 7: Security (Falco + compliance scanner + kube-bench)
# Requires EKS + Observability (OTel Collector must be running for Falcosidekick).
# ---------------------------------------------------------------------------
if [ "$ENABLE_SECURITY" = "true" ]; then
    echo "Step 7: Deploying Security module (Falco + compliance scanner + kube-bench)"
    echo "============================================================================"
    echo -e "${YELLOW}⏳ Installing Falco DaemonSet via Helm and creating Lambda functions...${NC}"
    terraform apply -target=module.security -auto-approve
    echo -e "${GREEN}✓ Security module deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 8: Database (RDS takes 5-10 minutes)
# ---------------------------------------------------------------------------
if [ "$ENABLE_DATABASE" = "true" ]; then
    echo "Step 8: Deploying Database (RDS ~5-10 minutes)"
    echo "==============================================="
    echo -e "${YELLOW}⏳ RDS creation is slow. Do not interrupt!${NC}"
    terraform apply -target=module.database -auto-approve
    echo -e "${GREEN}✓ Database deployed${NC}"
    echo ""
fi

# ---------------------------------------------------------------------------
# Step 9: Final synchronization (catches any inter-module dependencies)
# ---------------------------------------------------------------------------
echo "Step 9: Final synchronization"
echo "=============================="
terraform apply -auto-approve
echo -e "${GREEN}✓ All resources in sync${NC}"
echo ""

# ---------------------------------------------------------------------------
# Step 10: SLO status (only when slo module is enabled)
# Invokes the error budget Lambda once to force a fresh calculation,
# waits 10 seconds for CloudWatch metrics to propagate, then prints a
# formatted summary of the current SLO health.
# ---------------------------------------------------------------------------
if [ "$ENABLE_SLO" = "true" ]; then
    echo "Step 10: SLO Status Check"
    echo "========================="

    PROJECT_NAME=$(get_tfvar_string "project_name")
    ENVIRONMENT=$(get_tfvar_string "environment")
    PROJECT_NAME="${PROJECT_NAME:-cloudops}"
    ENVIRONMENT="${ENVIRONMENT:-dev}"
    LAMBDA_NAME="${PROJECT_NAME}-error-budget-tracker"

    echo "Invoking Lambda ${LAMBDA_NAME} for a fresh error budget calculation..."
    aws lambda invoke \
        --function-name "$LAMBDA_NAME" \
        --cli-binary-format raw-in-base64-out \
        --log-type None \
        /tmp/slo-response.json \
        > /tmp/slo-invoke-meta.json 2>&1 \
        && echo "Lambda invoked successfully." \
        || echo -e "${YELLOW}Warning: Lambda invocation failed — SLO summary may use stale data.${NC}"

    echo "Waiting 10 seconds for CloudWatch metrics to propagate..."
    sleep 10

    # Query CloudWatch for the latest SLO metrics published by the Lambda
    START_TIME=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || date -u -v-15M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || echo "")
    END_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    get_cw_metric() {
        local METRIC_NAME="$1"
        aws cloudwatch get-metric-statistics \
            --namespace CloudOps/SLO \
            --metric-name "$METRIC_NAME" \
            --dimensions \
                Name=Service,Value=order-api \
                Name=Environment,Value="${ENVIRONMENT}" \
            --start-time "$START_TIME" \
            --end-time "$END_TIME" \
            --period 900 \
            --statistics Average \
            --query 'sort_by(Datapoints, &Timestamp)[-1].Average' \
            --output text 2>/dev/null || echo ""
    }

    AVAIL_SLI=$(get_cw_metric "AvailabilitySLI")
    BUDGET_REM=$(get_cw_metric "ErrorBudgetRemaining")
    BURN_1H=$(get_cw_metric "BurnRate1h")

    # Read projected exhaustion hours from the Lambda's JSON response body
    PROJ_HOURS=""
    if [ -f /tmp/slo-response.json ]; then
        PROJ_HOURS=$(python3 -c "
import sys, json
try:
    with open('/tmp/slo-response.json') as f:
        data = json.load(f)
    body = data.get('body', '{}')
    if isinstance(body, str):
        body = json.loads(body)
    h = body.get('projectedExhaustionHours')
    if h is not None and h > 0:
        print(h)
except Exception:
    pass
" 2>/dev/null || echo "")
    fi

    # Format helpers
    fmt_pct() {
        local v="$1"
        if [ -z "$v" ] || [ "$v" = "None" ] || [ "$v" = "null" ] || [ "$v" = "N/A" ]; then
            echo "N/A"
        else
            python3 -c "print(f'{float(\"$v\"):.2f}%')" 2>/dev/null || echo "${v}%"
        fi
    }

    fmt_rate() {
        local v="$1"
        if [ -z "$v" ] || [ "$v" = "None" ] || [ "$v" = "null" ] || [ "$v" = "N/A" ]; then
            echo "N/A"
        else
            python3 -c "print(f'{float(\"$v\"):.2f}x')" 2>/dev/null || echo "$v"
        fi
    }

    fmt_exhaustion() {
        local v="$1"
        if [ -z "$v" ] || [ "$v" = "None" ] || [ "$v" = "null" ] || [ "$v" = "N/A" ]; then
            echo "N/A"
        else
            python3 -c "
h = float('$v')
if h > 720:
    print(f'{h/24:.0f}+ days')
elif h > 48:
    print(f'{h/24:.1f} days')
else:
    print(f'{h:.0f} hours')
" 2>/dev/null || echo "${v}h"
        fi
    }

    echo ""
    echo "=== SLO Status ==="
    printf "  %-28s %s\n" "Availability SLI:"      "$(fmt_pct "$AVAIL_SLI")"
    printf "  %-28s %s\n" "Error budget remaining:" "$(fmt_pct "$BUDGET_REM")"
    printf "  %-28s %s\n" "Burn rate (1h):"         "$(fmt_rate "$BURN_1H")"
    printf "  %-28s %s\n" "Projected exhaustion:"   "$(fmt_exhaustion "$PROJ_HOURS")"
    echo "=================="
    echo ""

    # Warn if budget is low
    if [ -n "$BUDGET_REM" ] && [ "$BUDGET_REM" != "None" ] && [ "$BUDGET_REM" != "null" ]; then
        BUDGET_INT=$(python3 -c "print(int(float('$BUDGET_REM')))" 2>/dev/null || echo "100")
        if [ "$BUDGET_INT" -lt 10 ]; then
            echo -e "${BOLD}${YELLOW}⚠  Error budget critically low (${BUDGET_INT}%) — consider a deployment freeze.${NC}"
            echo -e "   See: docs/runbooks/error-budget-exhausted.md"
            echo ""
        elif [ "$BUDGET_INT" -lt 50 ]; then
            echo -e "${YELLOW}⚠  Error budget below 50% (${BUDGET_INT}%) — monitor burn rate closely.${NC}"
            echo ""
        fi
    fi
fi

# ---------------------------------------------------------------------------
# Step 11: Security posture summary (only when security module is enabled)
# Triggers a fresh compliance scan, waits for results to propagate to
# CloudWatch, then prints findings by severity and lists any CRITICAL findings.
# ---------------------------------------------------------------------------
if [ "$ENABLE_SECURITY" = "true" ]; then
    echo "Step 11: Security Posture Summary"
    echo "=================================="

    PROJECT_NAME=$(get_tfvar_string "project_name")
    ENVIRONMENT=$(get_tfvar_string "environment")
    PROJECT_NAME="${PROJECT_NAME:-cloudops}"
    ENVIRONMENT="${ENVIRONMENT:-dev}"
    SCANNER_LAMBDA="${PROJECT_NAME}-compliance-scanner"

    echo "Invoking compliance scanner Lambda ${SCANNER_LAMBDA}..."
    aws lambda invoke \
        --function-name "$SCANNER_LAMBDA" \
        --cli-binary-format raw-in-base64-out \
        --log-type None \
        /tmp/security-scan.json \
        > /tmp/security-invoke-meta.json 2>&1 \
        && echo "Scan invoked successfully." \
        || {
            echo -e "${YELLOW}Warning: Compliance scanner Lambda invocation failed — posture summary unavailable.${NC}"
            echo -e "  Check that enable_security=true and the Lambda deployed correctly."
        }

    echo "Waiting 15 seconds for CloudWatch metrics to propagate..."
    sleep 15

    SCAN_END=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    SCAN_START=$(date -u -d '20 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || date -u -v-20M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
        || echo "")

    # Helper: query a single FindingsOpen metric from CloudWatch by Severity dimension
    get_security_count() {
        local SEV="$1"
        aws cloudwatch get-metric-statistics \
            --namespace CloudOps/Security \
            --metric-name FindingsOpen \
            --dimensions Name=Severity,Value="${SEV}" \
            --start-time "$SCAN_START" \
            --end-time "$SCAN_END" \
            --period 1200 \
            --statistics Sum \
            --query 'sort_by(Datapoints, &Timestamp)[-1].Sum' \
            --output text 2>/dev/null || echo "0"
    }

    # Normalize None/null/empty → 0
    norm_int() {
        local v="$1"
        if [ -z "$v" ] || [ "$v" = "None" ] || [ "$v" = "null" ]; then
            echo "0"
        else
            python3 -c "print(int(float('$v')))" 2>/dev/null || echo "0"
        fi
    }

    CRIT=$(norm_int "$(get_security_count CRITICAL)")
    HIGH=$(norm_int "$(get_security_count HIGH)")
    MED=$(norm_int "$(get_security_count MEDIUM)")
    LOW=$(norm_int "$(get_security_count LOW)")

    echo ""
    echo "=== Security Posture ==="
    printf "  %-18s %s\n" "CRITICAL:" "$CRIT"
    printf "  %-18s %s\n" "HIGH:"     "$HIGH"
    printf "  %-18s %s\n" "MEDIUM:"   "$MED"
    printf "  %-18s %s\n" "LOW:"      "$LOW"

    # Auto-remediation status from invoke metadata
    LAMBDA_STATUS=$(python3 -c "
import json
try:
    with open('/tmp/security-invoke-meta.json') as f:
        meta = json.load(f)
    print(meta.get('StatusCode', 'unknown'))
except Exception:
    print('unknown')
" 2>/dev/null || echo "unknown")
    printf "  %-18s %s\n" "Auto-remediation:" "$([ "$LAMBDA_STATUS" = "200" ] && echo "active" || echo "error (status $LAMBDA_STATUS)")"
    echo "========================"
    echo ""

    # Surface CRITICAL findings detail from the Lambda response body
    if [ "$CRIT" -gt 0 ] 2>/dev/null; then
        echo -e "${BOLD}${RED}⚠  $CRIT CRITICAL finding(s) require immediate attention:${NC}"
        python3 -c "
import json, sys
try:
    with open('/tmp/security-scan.json') as f:
        data = json.load(f)
    body = data.get('body', '{}')
    if isinstance(body, str):
        body = json.loads(body)
    # Try common response shapes
    findings = (body.get('criticalFindings')
             or body.get('newFindings')
             or body.get('findings')
             or [])
    crits = [f for f in findings if f.get('severity','').upper() == 'CRITICAL'][:5]
    for f in crits:
        check    = f.get('check_name', f.get('checkName', 'unknown check'))
        resource = f.get('resource_id', f.get('resourceId', 'unknown resource'))
        status   = f.get('status', 'OPEN')
        print(f'  [CRITICAL] {check}')
        print(f'             resource: {resource}  status: {status}')
    if not crits:
        print('  (Finding details not available in Lambda response — check DynamoDB or Grafana)')
except Exception as e:
    print(f'  (Could not parse scan response: {e})')
" 2>/dev/null
        echo ""
        echo -e "  Runbook : docs/runbooks/security/compliance-critical-finding.md"
        GRAFANA_URL=$(terraform output -raw grafana_url 2>/dev/null || echo "https://grafana.tamendutta.com")
        echo -e "  Grafana : ${GRAFANA_URL}/d/security-posture"
        echo ""
    fi

    TOTAL=$((CRIT + HIGH + MED + LOW))
    if [ "$TOTAL" -eq 0 ]; then
        echo -e "${GREEN}✓ Security posture: no open findings detected.${NC}"
        echo ""
    fi
fi

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

if [ "$ENABLE_SLO" = "true" ]; then
    GRAFANA_SA_ARN=$(terraform output -raw grafana_api_key_secret_arn 2>/dev/null || echo "(pending)")
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Grafana SA Secret ARN:" "$GRAFANA_SA_ARN"
fi

if [ "$ENABLE_SECURITY" = "true" ]; then
    SCANNER_ARN=$(terraform output -raw compliance_scanner_function_arn 2>/dev/null || echo "(pending)")
    SNS_ARN=$(terraform output -raw security_alerts_topic_arn 2>/dev/null || echo "(pending)")
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════════════════╣${NC}"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Compliance Scanner:" "$SCANNER_ARN"
    printf "${BOLD}${CYAN}║${NC}  %-24s %s\n" "Security Alerts SNS:" "$SNS_ARN"
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
