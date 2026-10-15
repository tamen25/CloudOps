#!/bin/bash
#This script runs OIDC automation for CloudOps.
#Usage: scripts/oidc.sh
#Run once locally before first CI/CD deployment.
#Creates AWS OIDC provider + GitHub Actions IAM role using AWS CLI only.
#No Terraform, no S3 bucket, no jq needed — just AWS credentials.
#Never needs to be run again unless you recreate the AWS account.

set -e

#Backlog #62 — moved from repo root to scripts/. Resolve repo root from
#this script's location so the bare `terraform.tfvars` lookup below works.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
cd "$REPO_ROOT"

#── Colors (matches scripts/deploy.sh) ────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

#Handles info.
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
#Handles success.
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
#Handles warn.
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
#Handles die.
die()     { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
#Handles step.
step()    { echo -e "\n${BOLD}${CYAN}▶ $*${NC}"; }

echo -e "${BOLD}"
echo "========================================"
echo "   CloudOps OIDC Bootstrap"
echo "========================================"
echo -e "${NC}"

#── Step 1: Validate prerequisites ───────────────────────────────────────────
step "Validating prerequisites"

command -v aws &>/dev/null || die "aws CLI not found. Install from https://aws.amazon.com/cli/"
success "aws CLI is installed"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || die "aws sts get-caller-identity failed. Run 'aws configure' or set AWS_PROFILE."
CALLER_ARN=$(aws sts get-caller-identity --query Arn --output text)
AWS_REGION=${AWS_DEFAULT_REGION:-$(aws configure get region 2>/dev/null || echo "us-east-1")}

echo ""
echo -e "  Account ID  : ${BOLD}${ACCOUNT_ID}${NC}"
echo -e "  Region      : ${BOLD}${AWS_REGION}${NC}"
echo -e "  Caller ARN  : ${BOLD}${CALLER_ARN}${NC}"
echo ""
read -r -p "Proceed with this account and region? [y/N] " CONFIRM
[[ "${CONFIRM,,}" == "y" ]] || { warn "Aborted by user."; exit 0; }

#── Step 2: Read config from terraform.tfvars ─────────────────────────────────
step "Reading config from terraform.tfvars"

TFVARS="terraform.tfvars"
[[ -f "$TFVARS" ]] || die "$TFVARS not found. Copy terraform.tfvars.example and fill in your values."

#Gets tfvar.
get_tfvar() {
  #Handles:  key = "value"  and  key = value  (strips quotes, trailing spaces, inline comments)
  grep -E "^${1}\s*=" "$TFVARS" 2>/dev/null \
    | sed -E 's/^[^=]+=\s*"?([^"#]+)"?.*/\1/' \
    | tr -d ' ' \
    | head -1
}

PROJECT_NAME=$(get_tfvar "project_name")
ENVIRONMENT=$(get_tfvar "environment")
REGION=$(get_tfvar "region")

[[ -n "$PROJECT_NAME" ]] || die "project_name not found in $TFVARS"
[[ -n "$ENVIRONMENT" ]]  || die "environment not found in $TFVARS"
[[ -n "$REGION" ]]       || REGION="$AWS_REGION"

ROLE_NAME="${PROJECT_NAME}-github-actions"
POLICY_NAME="cloudops-github-actions-policy"
GITHUB_REPO="${GITHUB_REPO:-$(git config --get remote.origin.url 2>/dev/null | sed -E 's#.*[/:]([^/]+/[^/]+)\.git#\1#' | sed -E 's#\.git$##')}"
if [ -z "$GITHUB_REPO" ] || [ "$GITHUB_REPO" = "$(git config --get remote.origin.url 2>/dev/null)" ]; then
    echo "Error: set GITHUB_REPO=owner/repo (auto-detect from git remote failed)" >&2
    exit 1
fi
OIDC_URL="https://token.actions.githubusercontent.com"
OIDC_THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"

info "project_name : $PROJECT_NAME"
info "environment  : $ENVIRONMENT"
info "region       : $REGION"
info "role name    : $ROLE_NAME"

#── Step 3: Create OIDC provider (idempotent) ─────────────────────────────────
step "Checking OIDC provider"

EXISTING_OIDC=$(aws iam list-open-id-connect-providers \
  --query "OpenIDConnectProviderList[?ends_with(Arn, 'token.actions.githubusercontent.com')].Arn" \
  --output text 2>/dev/null)

if [[ -n "$EXISTING_OIDC" && "$EXISTING_OIDC" != "None" ]]; then
  success "OIDC provider already exists: $EXISTING_OIDC"
  OIDC_ARN="$EXISTING_OIDC"
else
  info "Creating OIDC provider for $OIDC_URL ..."
  OIDC_ARN=$(aws iam create-open-id-connect-provider \
    --url "$OIDC_URL" \
    --thumbprint-list "$OIDC_THUMBPRINT" \
    --client-id-list "sts.amazonaws.com" \
    --query OpenIDConnectProviderArn \
    --output text)
  success "OIDC provider created: $OIDC_ARN"
fi

#── Step 4: Build trust policy ────────────────────────────────────────────────
step "Building trust policy"

TRUST_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "${OIDC_ARN}"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:${GITHUB_REPO}:*"
        }
      }
    }
  ]
}
EOF
)

success "Trust policy built (scoped to repo:${GITHUB_REPO}:*)"

#── Steps 5 & 6: Create or update IAM role (idempotent) ──────────────────────
step "Creating / updating IAM role: $ROLE_NAME"

if aws iam get-role --role-name "$ROLE_NAME" --output text >/dev/null 2>&1; then
  ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" \
    --query 'Role.Arn' --output text)
  info "Role already exists: $ROLE_ARN"
  info "Updating trust policy ..."
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY"
  success "Trust policy updated"
else
  info "Creating role $ROLE_NAME ..."
  ROLE_ARN=$(aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "${PROJECT_NAME} GitHub Actions OIDC role" \
    --max-session-duration 3600 \
    --tags \
      Key=project,Value="${PROJECT_NAME}" \
      Key=environment,Value="${ENVIRONMENT}" \
      Key=managed-by,Value=oidc-sh \
    --query 'Role.Arn' \
    --output text)
  success "Role created: $ROLE_ARN"
fi

#── Step 7: Attach inline permissions policy (idempotent) ────────────────────
step "Attaching permissions policy: $POLICY_NAME"

PERMISSIONS_POLICY=$(cat <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "FullInfrastructureDeployment",
      "Effect": "Allow",
      "Action": [
        "ec2:*",
        "ecr:*",
        "ecs:*",
        "eks:*",
        "elasticloadbalancing:*",
        "autoscaling:*",
        "cloudwatch:*",
        "logs:*",
        "iam:*",
        "kms:*",
        "rds:*",
        "route53:*",
        "acm:*",
        "s3:*",
        "secretsmanager:*",
        "ssm:*",
        "lambda:*",
        "dynamodb:*",
        "sns:*",
        "sqs:*",
        "events:*",
        "scheduler:*",
        "budgets:*",
        "ce:*",
        "pricing:*",
        "sts:AssumeRole",
        "sts:GetCallerIdentity"
      ],
      "Resource": "*"
    }
  ]
}
EOF
)

#put-role-policy is always an upsert — check only for the info message
if aws iam get-role-policy \
     --role-name "$ROLE_NAME" \
     --policy-name "$POLICY_NAME" \
     --output text >/dev/null 2>&1; then
  info "Inline policy '$POLICY_NAME' already exists — updating ..."
else
  info "Attaching inline policy '$POLICY_NAME' ..."
fi

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "$POLICY_NAME" \
  --policy-document "$PERMISSIONS_POLICY"

success "Policy '$POLICY_NAME' applied to role $ROLE_NAME"

#── Step 8: Print final summary ───────────────────────────────────────────────
BUCKET_NAME="${PROJECT_NAME}-tfstate-tamen25"

echo ""
echo -e "${BOLD}${GREEN}"
echo "========================================"
echo "  OIDC Bootstrap Complete"
echo "========================================"
echo -e "${NC}"
echo -e "  OIDC Provider ARN : ${BOLD}${OIDC_ARN}${NC}"
echo -e "  GitHub Role ARN   : ${BOLD}${ROLE_ARN}${NC}"
echo -e "  Account ID        : ${BOLD}${ACCOUNT_ID}${NC}"
echo ""
echo -e "${CYAN}Add these secrets to GitHub Actions:${NC}"
echo -e "  ${BOLD}https://github.com/${GITHUB_REPO}/settings/secrets/actions${NC}"
echo ""
echo -e "${BOLD}Secret name                     Value${NC}"
echo "────────────────────────────────────────────────────────────────"
echo -e "AWS_GITHUB_ACTIONS_ROLE_ARN     ${ROLE_ARN}"
echo -e "AWS_REGION                      ${REGION}"
echo -e "TF_VAR_AWS_ACCOUNT_ID           ${ACCOUNT_ID}"
echo -e "TF_VAR_BOOTSTRAP_BUCKET_NAME    ${BUCKET_NAME}"
echo -e "TF_VAR_PROJECT_NAME             ${PROJECT_NAME}"
echo -e "TF_VAR_ENVIRONMENT              ${ENVIRONMENT}"
echo -e "TF_VAR_OWNER                    Tamen"
echo -e "TF_VAR_DOMAIN                   <your-domain>"
echo -e "TF_VAR_SECURITY_ALERT_EMAIL     (your email)"
echo -e "TF_VAR_COST_ALERT_EMAIL         (your email)"
echo -e "TF_VAR_GITHUB_TOKEN             (GitHub PAT with repo scope)"
echo -e "TF_VAR_COST_BUDGET_MONTHLY_USD  50"
echo -e "TF_VAR_CONTAINER_IMAGE          (leave blank for now)"
echo ""
echo -e "${CYAN}Also create a GitHub environment named 'production':${NC}"
echo -e "  ${BOLD}https://github.com/${GITHUB_REPO}/settings/environments${NC}"
echo ""
echo -e "${CYAN}Once secrets are added — push to main to trigger the pipeline.${NC}"
echo ""
echo -e "${BOLD}${GREEN}========================================"
echo -e "${NC}"
