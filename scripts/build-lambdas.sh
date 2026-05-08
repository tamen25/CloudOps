#!/usr/bin/env bash
# Installs production node_modules for every Lambda module out-of-band so
# `terraform apply` no longer runs `npm install` via a null_resource +
# local-exec. Closes backlog #20.
#
# Run before `terraform plan/apply` (CI does this in infra.yml). Terraform's
# data.archive_file zips each lambda directory after this script finishes.
#
# Idempotent: skips dirs whose node_modules is newer than package.json.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

LAMBDA_DIRS=(
  "modules/slo/lambda_function"
  "modules/finops/lambda_function/cost_ingestion"
  "modules/finops/lambda_function/idle_detector"
  "modules/self_healing/lambda_function"
  "modules/self_healing/lambda_function_scale_in"
  "modules/security/lambda_function/auto_remediation"
  "modules/security/lambda_function/compliance_scanner"
  "modules/security/lambda_function/kube_bench_processor"
)

needs_install() {
  local dir="$1"
  [ ! -d "$dir/node_modules" ] && return 0
  [ ! -f "$dir/package.json" ] && return 1
  local pkg_mtime nm_mtime
  pkg_mtime=$(stat -c '%Y' "$dir/package.json" 2>/dev/null || stat -f '%m' "$dir/package.json")
  nm_mtime=$(stat -c '%Y' "$dir/node_modules" 2>/dev/null || stat -f '%m' "$dir/node_modules")
  awk -v a="$pkg_mtime" -v b="$nm_mtime" 'BEGIN { exit !(a > b) }'
}

login_codeartifact() {
  if [[ -z "${CODEARTIFACT_DOMAIN:-}" || -z "${CODEARTIFACT_REPOSITORY:-}" ]]; then
    return
  fi

  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI is required when CODEARTIFACT_DOMAIN is set" >&2
    exit 1
  fi

  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  echo "Logging npm into CodeArtifact: ${CODEARTIFACT_DOMAIN}/${CODEARTIFACT_REPOSITORY}"
  aws codeartifact login \
    --tool npm \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY"
}

main() {
  local force="${FORCE_REBUILD:-0}"
  local installed=0 skipped=0
  login_codeartifact

  for dir in "${LAMBDA_DIRS[@]}"; do
    if [ ! -f "$dir/package.json" ]; then
      echo "- $dir (no package.json — skip)"
      skipped=$((skipped + 1))
      continue
    fi
    if [ "$force" != "1" ] && ! needs_install "$dir"; then
      echo "= $dir/node_modules (up to date)"
      skipped=$((skipped + 1))
      continue
    fi
    # Closes backlog #29 — prefer `npm ci` against a committed lockfile so
    # builds resolve identical dependency trees in CI and locally. Falls back
    # to `npm install` for dirs that haven't generated a lock yet (running
    # the script once locally will produce one).
    if [ -f "$dir/package-lock.json" ]; then
      echo "▶ npm ci --omit=dev in $dir"
      (cd "$dir" && npm ci --omit=dev --no-audit --no-fund --silent)
    else
      echo "▶ npm install --omit=dev in $dir (no lockfile yet — will generate)"
      (cd "$dir" && npm install --omit=dev --no-audit --no-fund --silent)
    fi
    installed=$((installed + 1))
  done
  echo
  echo "Lambda deps summary: $installed installed, $skipped up-to-date"
}

main "$@"
