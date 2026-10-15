#!/usr/bin/env bash
#This script runs write ci tfvars automation for CloudOps.
set -euo pipefail

target="${TARGET_ENVIRONMENT:-dev}"

case "$target" in
  dev|staging|prod) ;;
  *)
    echo "::error::TARGET_ENVIRONMENT must be one of: dev, staging, prod (got '$target')"
    exit 1
    ;;
esac

selected=""
case "$target" in
  dev)
    selected="${TF_VARS_DEV:-${TF_VARS:-}}"
    ;;
  staging)
    selected="${TF_VARS_STAGING:-${TF_VARS:-}}"
    ;;
  prod)
    selected="${TF_VARS_PROD:-${TF_VARS:-}}"
    ;;
esac

if [ -z "$selected" ]; then
  upper_target=$(printf '%s' "$target" | tr '[:lower:]' '[:upper:]')
  echo "::error::No tfvars secret found for environment=$target. Set TF_VARS_${upper_target} or environment-scoped TF_VARS."
  exit 1
fi

printf '%s' "$selected" > terraform.tfvars

tfvars_environment=$(
  sed -nE 's/^environment[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' terraform.tfvars \
    | head -n 1
)

if [ -z "$tfvars_environment" ]; then
  echo "::error::terraform.tfvars must set environment = \"$target\""
  exit 1
fi

if [ "$tfvars_environment" != "$target" ]; then
  echo "::error::Selected target environment=$target but terraform.tfvars has environment=$tfvars_environment"
  exit 1
fi

echo "Wrote terraform.tfvars for environment=$target"
