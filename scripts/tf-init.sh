#!/usr/bin/env bash
# Wrapper for `terraform init` that reads the backend bucket from
# terraform.tfvars and passes it as -backend-config. Lets the same provider.tf
# work for any fork without code changes.
#
# Usage:
#   scripts/tf-init.sh                     — local: uses ./terraform.tfvars
#   scripts/tf-init.sh -upgrade            — passes through extra init flags
#   BOOTSTRAP_BUCKET=foo scripts/tf-init.sh — explicit override
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

echo "terraform init -backend-config=\"bucket=$BOOTSTRAP_BUCKET\" $*"
exec terraform init -backend-config="bucket=$BOOTSTRAP_BUCKET" "$@"
