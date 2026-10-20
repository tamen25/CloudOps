#!/usr/bin/env bash
set -euo pipefail

MODE="publish"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

PACKAGE_ROOT="${PACKAGE_ROOT:-libraries/nodejs}"

if [[ ! -d "$PACKAGE_ROOT" ]]; then
  echo "Node package root not found: $PACKAGE_ROOT"
  exit 0
fi

mapfile -t MANIFESTS < <(find "$PACKAGE_ROOT" -mindepth 2 -maxdepth 2 -name package.json -print | sort)

if [[ "${#MANIFESTS[@]}" -eq 0 ]]; then
  echo "No Node package manifests found under $PACKAGE_ROOT"
  exit 0
fi

read_package_field() {
  local field="$1"
  node -e "const p=require('./package.json'); const v=p['$field']; if (!v) process.exit(1); console.log(v)" \
    2>/dev/null \
    < /dev/null
}

read_package_private() {
  node -e "const p=require('./package.json'); console.log(p.private === true ? 'true' : 'false')" \
    2>/dev/null \
    < /dev/null
}

package_has_source() {
  local dir="$1"
  [[ -f "$dir/src/index.ts" || -f "$dir/src/index.js" ]]
}

login_codeartifact() {
  if [[ -z "${CODEARTIFACT_DOMAIN:-}" || -z "${CODEARTIFACT_REPOSITORY:-}" ]]; then
    echo "CODEARTIFACT_DOMAIN/CODEARTIFACT_REPOSITORY not set; using existing npm registry config"
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

  aws codeartifact login \
    --tool npm \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY"
}

LOGGED_IN="0"

#Ensures codeartifact login.
ensure_codeartifact_login() {
  if [[ "$LOGGED_IN" == "1" ]]; then
    return
  fi

  login_codeartifact
  LOGGED_IN="1"
}

for manifest in "${MANIFESTS[@]}"; do
  dir="$(dirname "$manifest")"

  pushd "$dir" >/dev/null
  name="$(read_package_field "name")"
  version="$(read_package_field "version")"
  private_package="$(read_package_private)"
  popd >/dev/null

  if [[ "$MODE" == "check" ]]; then
    echo "Found $name@$version in $dir"
    if [[ "$name" != @cloudops/* ]]; then
      echo "Package $name should use the @cloudops scope" >&2
      exit 1
    fi
    continue
  fi

  if [[ "$private_package" == "true" ]]; then
    echo "Skipping $name@$version: package.json private=true"
    continue
  fi

  if ! package_has_source "$dir"; then
    echo "Skipping $name@$version: no src/index.ts or src/index.js yet"
    continue
  fi

  echo "Publishing $name@$version from $dir"
  pushd "$dir" >/dev/null

  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi

  npm run build --if-present

  ensure_codeartifact_login

  if npm view "$name@$version" version >/dev/null 2>&1; then
    echo "Skipping $name@$version: version already exists"
    popd >/dev/null
    continue
  fi

  npm publish
  popd >/dev/null
done
