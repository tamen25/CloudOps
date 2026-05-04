#!/usr/bin/env bash
# Wrapper for `terraform init` that reads bucket + state-key config from
# terraform.tfvars and passes them as -backend-config. Lets the same
# provider.tf work for any fork and any environment without code changes.
#
# Usage:
#   scripts/tf-init.sh                       — local: uses ./terraform.tfvars
#   scripts/tf-init.sh -upgrade              — passes through extra init flags
#   BOOTSTRAP_BUCKET=foo scripts/tf-init.sh  — explicit bucket override
#   STATE_KEY=dev/terraform.tfstate scripts/tf-init.sh — explicit key override
#   SKIP_BUCKET_CHECK=1 scripts/tf-init.sh   — skip bucket existence preflight
#
# State-key layout (backlog #10):
#   environment=dev  → dev/terraform.tfstate
#   environment=prod → prod/terraform.tfstate
#   etc.
# Existing single-state users (`main/terraform.tfstate`) — migrate with:
#   STATE_KEY=dev/terraform.tfstate scripts/tf-init.sh -migrate-state
# from a checkout where the old `main/...` key is still in provider.tf locally.
set -euo pipefail

if [ -z "${BOOTSTRAP_BUCKET:-}" ]; then
  if [ ! -f terraform.tfvars ]; then
    echo "Error: terraform.tfvars not found and BOOTSTRAP_BUCKET not set." >&2
    exit 1
  fi
  BOOTSTRAP_BUCKET=$(grep '^bootstrap_bucket_name' terraform.tfvars \
    | sed 's/.*= *"\(.*\)".*/\1/' \
    | head -1)
fi

if [ -z "$BOOTSTRAP_BUCKET" ]; then
  echo "Error: bootstrap_bucket_name missing from terraform.tfvars and BOOTSTRAP_BUCKET unset." >&2
  exit 1
fi

# ── State key derivation (per-env) ────────────────────────────────────────────
# Caller may set STATE_KEY explicitly; otherwise we derive from environment.
if [ -z "${STATE_KEY:-}" ]; then
  ENV=$(grep '^environment' terraform.tfvars 2>/dev/null \
    | sed 's/.*= *"\(.*\)".*/\1/' \
    | head -1)
  if [ -z "$ENV" ]; then
    echo "Error: environment missing from terraform.tfvars and STATE_KEY unset." >&2
    exit 1
  fi
  STATE_KEY="${ENV}/terraform.tfstate"
fi

# ── Preflight: confirm bucket actually exists in this AWS account ────────────
# Closes backlog #6. Without this, a typo in bootstrap_bucket_name silently
# makes terraform init create a brand-new state bucket pointing at the wrong
# location, splitting state across two buckets. Skip the check with
# SKIP_BUCKET_CHECK=1 (e.g. on a fresh fork before the bucket exists).
if [ "${SKIP_BUCKET_CHECK:-0}" != "1" ]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "Warning: aws CLI not found — skipping bootstrap_bucket_name preflight." >&2
  else
    if ! aws s3api head-bucket --bucket "$BOOTSTRAP_BUCKET" >/dev/null 2>&1; then
      cat >&2 <<EOF
Error: bootstrap_bucket_name "$BOOTSTRAP_BUCKET" was not found in this account/region.
       Either:
         1. The bucket does not exist yet — set SKIP_BUCKET_CHECK=1 and let
            scripts/bootstrap.sh (or module.bootstrap) create it.
         2. terraform.tfvars is pointing at the wrong bucket — fix the value.
       Refusing to init against a bucket that does not exist to avoid splitting
       state across two locations.
EOF
      exit 1
    fi
  fi
fi

echo "terraform init -backend-config=\"bucket=$BOOTSTRAP_BUCKET\" -backend-config=\"key=$STATE_KEY\" $*"
exec terraform init \
  -backend-config="bucket=$BOOTSTRAP_BUCKET" \
  -backend-config="key=$STATE_KEY" \
  "$@"
