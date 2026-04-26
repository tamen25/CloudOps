#!/bin/bash
# CloudOps teardown — destroys EVERYTHING except Route 53 + OIDC.
#
# Preserved by default:
#   - module.dns           (Route 53 hosted zone — registrar NS records would
#                           need re-pointing on every rebuild otherwise)
#   - module.bootstrap     (OIDC provider, GitHub Actions IAM role, KMS state
#                           key, S3 state bucket, ECR pull-through cache)
#
# Destroyed:
#   - module.networking, eks, ingress, observability, security, database,
#     self_healing, slo, finops, compliance, backup
#   - All extra S3 buckets created outside Terraform state (Mimir, Thanos,
#     flow logs, CloudTrail, Config) emptied + deleted explicitly
#
# Use `--nuke-bootstrap` to also wipe OIDC + state bucket (rare; you'll need
# to re-run ./oidc.sh before the next deploy).

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

NUKE_BOOTSTRAP=false
for arg in "$@"; do
    case "$arg" in
        --nuke-bootstrap) NUKE_BOOTSTRAP=true ;;
        --help|-h)
            echo "Usage: $0 [--nuke-bootstrap]"
            echo "  Default: keeps Route 53 + OIDC + state bucket."
            echo "  --nuke-bootstrap: wipes everything including OIDC. You'll re-run ./oidc.sh."
            exit 0 ;;
    esac
done

echo -e "${RED}================================================${NC}"
echo -e "${RED}   CloudOps Infrastructure Destruction${NC}"
echo -e "${RED}================================================${NC}"
echo ""
if $NUKE_BOOTSTRAP; then
    echo -e "${RED}MODE: --nuke-bootstrap — destroys EVERYTHING including OIDC + state bucket${NC}"
else
    echo -e "${YELLOW}MODE: default — preserves Route 53 + OIDC + state bucket${NC}"
fi
echo ""

# Validate dependencies
command -v aws       >/dev/null || { echo "Error: aws CLI not found"; exit 1; }
command -v terraform >/dev/null || { echo "Error: terraform not found"; exit 1; }

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

get_tfvar() {
    grep "^$1" terraform.tfvars 2>/dev/null | sed 's/.*=\s*"\(.*\)"/\1/' | tr -d ' "'
}

REGION=$(get_tfvar "region")
PROJECT_NAME=$(get_tfvar "project_name")
BUCKET_NAME=$(get_tfvar "bootstrap_bucket_name")
[ -z "$BUCKET_NAME" ] && BUCKET_NAME="${PROJECT_NAME}-tfstate-bucket"

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$REGION" 2>/dev/null || echo "")

echo -e "${CYAN}Configuration:${NC}"
echo "  Project:      $PROJECT_NAME"
echo "  Region:       $REGION"
echo "  Account:      $ACCOUNT_ID"
echo "  State bucket: $BUCKET_NAME"
echo ""
echo -e "${RED}This will destroy:${NC}"
echo "  - All workload modules (networking, eks, ingress, observability, security, db, self_healing, slo, finops, compliance, backup)"
echo "  - Observability buckets: loki, tempo, mimir, thanos (if any)"
echo "  - VPC flow logs bucket, CloudTrail bucket, Config bucket"
echo "  - GuardDuty detector, Security Hub subscription, Config recorder"
echo "  - WAF web ACL + association"
if $NUKE_BOOTSTRAP; then
    echo "  - module.bootstrap: OIDC, IAM role, KMS state key, ECR pull-through cache"
    echo "  - module.dns: Route 53 hosted zone"
    echo "  - State bucket: $BUCKET_NAME (after final apply completes)"
else
    echo ""
    echo -e "${GREEN}Preserved:${NC}"
    echo "  - module.dns         (Route 53)"
    echo "  - module.bootstrap   (OIDC, GitHub Actions IAM role, state bucket, ECR cache, KMS state key)"
fi
echo ""
echo -e "${RED}THIS CANNOT BE UNDONE!${NC}"
read -p "Type 'destroy-everything' to confirm: " -r
[[ "$REPLY" != "destroy-everything" ]] && { echo -e "${YELLOW}Cancelled${NC}"; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

empty_s3_bucket() {
    local bucket=$1
    if ! aws s3api head-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null; then
        return 0
    fi
    echo "  Emptying $bucket..."
    aws s3 rm "s3://$bucket" --recursive --region "$REGION" 2>/dev/null || true
    for query in \
        '{Objects: Versions[].{Key:Key,VersionId:VersionId}}' \
        '{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}'; do
        local payload
        payload=$(aws s3api list-object-versions --bucket "$bucket" --region "$REGION" \
            --query "$query" --output json 2>/dev/null || echo '{"Objects":[]}')
        if echo "$payload" | grep -q '"Key"'; then
            aws s3api delete-objects --bucket "$bucket" --region "$REGION" \
                --delete "$payload" 2>/dev/null || true
        fi
    done
    echo -e "${GREEN}  ✓ $bucket emptied${NC}"
}

delete_s3_bucket() {
    local bucket=$1
    if aws s3api head-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null; then
        empty_s3_bucket "$bucket"
        aws s3api delete-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null \
            && echo -e "${GREEN}  ✓ $bucket deleted${NC}" \
            || echo -e "${YELLOW}  ⚠ $bucket delete failed (Object Lock or vault lock?)${NC}"
    fi
}

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Drain RDS first (5-15 min, blocks dependent destroys)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Step 1: Deleting RDS instances${NC}"
RDS_INSTANCE="${PROJECT_NAME}-db-primary"
if aws rds describe-db-instances --db-instance-identifier "$RDS_INSTANCE" --region "$REGION" 2>/dev/null | grep -q "$RDS_INSTANCE"; then
    # Disable deletion_protection if it's on (prod-test mode)
    aws rds modify-db-instance --db-instance-identifier "$RDS_INSTANCE" \
        --no-deletion-protection --apply-immediately --region "$REGION" 2>/dev/null || true

    echo "  Deleting $RDS_INSTANCE (5-15 minutes)..."
    aws rds delete-db-instance \
        --db-instance-identifier "$RDS_INSTANCE" \
        --skip-final-snapshot \
        --delete-automated-backups \
        --region "$REGION" 2>/dev/null || true

    aws rds wait db-instance-deleted --db-instance-identifier "$RDS_INSTANCE" --region "$REGION" 2>/dev/null \
        && echo -e "${GREEN}  ✓ RDS deleted${NC}" \
        || echo -e "${YELLOW}  ⚠ RDS deletion timed out — continuing${NC}"
else
    echo "  No RDS instance found"
fi

# Read replica
REPLICA="${PROJECT_NAME}-db-replica"
if aws rds describe-db-instances --db-instance-identifier "$REPLICA" --region "$REGION" 2>/dev/null | grep -q "$REPLICA"; then
    echo "  Deleting read replica $REPLICA..."
    aws rds delete-db-instance --db-instance-identifier "$REPLICA" \
        --skip-final-snapshot --region "$REGION" 2>/dev/null || true
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Disable workload modules via TF apply (cascades destroy in order)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Step 2: Disabling workload modules${NC}"

cp terraform.tfvars terraform.tfvars.backup

# Disable in reverse dependency order. Bootstrap + DNS stay enabled.
for var in enable_compliance enable_backup enable_finops enable_slo enable_self_healing \
           enable_security enable_observability enable_database enable_ingress enable_eks \
           enable_networking; do
    sed -i "s|^${var}\s*=\s*true|${var} = false|" terraform.tfvars
    grep -q "^${var}" terraform.tfvars || echo "${var} = false" >> terraform.tfvars
done

./scripts/tf-init.sh
terraform apply -auto-approve
echo -e "${GREEN}  ✓ Workload modules destroyed${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Empty + delete observability buckets that may still hold data
# (Mimir, Thanos, flow logs, CloudTrail, Config) — TF should have deleted
# these but force_destroy=false in prod-shaped configs leaves them behind.
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Step 3: Cleaning leftover buckets${NC}"

if [ -n "$ACCOUNT_ID" ]; then
    for bkt in \
        "${PROJECT_NAME}-loki-chunks-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-tempo-traces-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-mimir-blocks-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-thanos-blocks-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-vpc-flow-logs-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-cloudtrail-${ACCOUNT_ID}" \
        "${PROJECT_NAME}-aws-config-${ACCOUNT_ID}"; do
        delete_s3_bucket "$bkt"
    done
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: AWS Backup vault — only if not locked
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Step 4: Checking AWS Backup vault${NC}"
VAULT="${PROJECT_NAME}-${ENVIRONMENT}-vault"
if aws backup describe-backup-vault --backup-vault-name "$VAULT" --region "$REGION" >/dev/null 2>&1; then
    LOCK=$(aws backup describe-backup-vault --backup-vault-name "$VAULT" --region "$REGION" \
        --query 'Locked' --output text 2>/dev/null || echo "false")
    if [ "$LOCK" = "True" ]; then
        echo -e "${YELLOW}  ⚠ Vault $VAULT is LOCKED — cannot delete until min_retention_days expires${NC}"
        echo -e "${YELLOW}    All recovery points must also expire before vault delete succeeds.${NC}"
    else
        # Delete recovery points then vault
        aws backup list-recovery-points-by-backup-vault --backup-vault-name "$VAULT" --region "$REGION" \
            --query 'RecoveryPoints[].RecoveryPointArn' --output text 2>/dev/null \
        | xargs -r -n 1 -I {} aws backup delete-recovery-point --backup-vault-name "$VAULT" \
            --recovery-point-arn {} --region "$REGION" 2>/dev/null || true
        aws backup delete-backup-vault --backup-vault-name "$VAULT" --region "$REGION" 2>/dev/null \
            && echo -e "${GREEN}  ✓ Vault deleted${NC}" \
            || echo -e "${YELLOW}  ⚠ Vault delete failed (recovery points still pending?)${NC}"
    fi
else
    echo "  No backup vault found"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: GuardDuty / Security Hub / Config (if module destroy didn't get them)
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}Step 5: Compliance services${NC}"
DETECTOR=$(aws guardduty list-detectors --region "$REGION" --query 'DetectorIds[0]' --output text 2>/dev/null || echo "")
if [ "$DETECTOR" != "None" ] && [ -n "$DETECTOR" ]; then
    aws guardduty delete-detector --detector-id "$DETECTOR" --region "$REGION" 2>/dev/null \
        && echo -e "${GREEN}  ✓ GuardDuty detector deleted${NC}" \
        || echo -e "${YELLOW}  ⚠ GuardDuty delete failed${NC}"
fi

aws securityhub disable-security-hub --region "$REGION" 2>/dev/null \
    && echo -e "${GREEN}  ✓ Security Hub disabled${NC}" || true

# Stop Config recorder (Config can't be 'deleted' — recorder/channel are removed)
RECORDER="${PROJECT_NAME}-${ENVIRONMENT}-recorder"
aws configservice stop-configuration-recorder --configuration-recorder-name "$RECORDER" --region "$REGION" 2>/dev/null || true
aws configservice delete-configuration-recorder --configuration-recorder-name "$RECORDER" --region "$REGION" 2>/dev/null || true
aws configservice delete-delivery-channel --delivery-channel-name "${PROJECT_NAME}-${ENVIRONMENT}-channel" --region "$REGION" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Optionally nuke bootstrap (--nuke-bootstrap)
# ─────────────────────────────────────────────────────────────────────────────
if $NUKE_BOOTSTRAP; then
    echo ""
    echo -e "${RED}Step 6: --nuke-bootstrap — wiping OIDC + state${NC}"
    sed -i 's|^destroy_all\s*=\s*false|destroy_all = true|' terraform.tfvars
    grep -q '^destroy_all' terraform.tfvars || echo 'destroy_all = true' >> terraform.tfvars

    terraform apply -auto-approve

    if aws s3api head-bucket --bucket "$BUCKET_NAME" --region "$REGION" 2>/dev/null; then
        delete_s3_bucket "$BUCKET_NAME"
    fi

    rm -f terraform.tfstate terraform.tfstate.backup tfplan
    rm -rf .terraform
    rm -f .terraform.lock.hcl
    echo -e "${GREEN}  ✓ Bootstrap + state wiped — re-run ./oidc.sh and ./scripts/tf-init.sh before next deploy${NC}"
else
    echo ""
    echo -e "${GREEN}Step 6: Bootstrap + DNS preserved — next deploy reuses OIDC and Route 53${NC}"
fi

# Restore tfvars (keeps the user's original toggles for next deploy)
mv terraform.tfvars.backup terraform.tfvars

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Teardown complete${NC}"
echo -e "${GREEN}================================================${NC}"
if $NUKE_BOOTSTRAP; then
    echo "Everything destroyed. Re-run ./oidc.sh + ./deploy.sh for a fresh start."
else
    echo "Workload destroyed. Route 53 + OIDC preserved."
    echo "Run ./deploy.sh to rebuild."
fi
echo ""
