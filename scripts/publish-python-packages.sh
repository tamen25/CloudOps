#!/usr/bin/env bash
set -euo pipefail

MODE="publish"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

PACKAGE_ROOT="${PACKAGE_ROOT:-libraries/python}"
CODEARTIFACT_REPOSITORY="${CODEARTIFACT_PYTHON_REPOSITORY:-${CODEARTIFACT_REPOSITORY:-cloudops-python}}"

if [[ ! -d "$PACKAGE_ROOT" ]]; then
  echo "Python package root not found: $PACKAGE_ROOT"
  exit 0
fi

mapfile -t MANIFESTS < <(find "$PACKAGE_ROOT" -mindepth 2 -maxdepth 2 -name pyproject.toml -print | sort)

if [[ "${#MANIFESTS[@]}" -eq 0 ]]; then
  echo "No Python package manifests found under $PACKAGE_ROOT"
  exit 0
fi

read_pyproject_field() {
  local field="$1"
  python -c "import tomllib; p=tomllib.load(open('pyproject.toml','rb')); print(p['project'].get('$field',''))"
}

login_codeartifact() {
  if [[ -z "${CODEARTIFACT_DOMAIN:-}" ]]; then
    echo "CODEARTIFACT_DOMAIN is required for Python publish" >&2
    exit 1
  fi

  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI is required for Python publish" >&2
    exit 1
  fi

  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  aws codeartifact login \
    --tool twine \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY"
}

version_exists() {
  local package_name="$1"
  local version="$2"
  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  aws codeartifact list-package-versions \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY" \
    --format pypi \
    --package "$package_name" \
    --query "versions[?version=='$version'].version | [0]" \
    --output text 2>/dev/null | grep -qx "$version"
}

LOGGED_IN="0"

for manifest in "${MANIFESTS[@]}"; do
  dir="$(dirname "$manifest")"

  pushd "$dir" >/dev/null
  name="$(read_pyproject_field "name")"
  version="$(read_pyproject_field "version")"
  popd >/dev/null

  if [[ "$MODE" == "check" ]]; then
    echo "Found ${name}@${version} in $dir"
    if [[ "$name" != cloudops-* ]]; then
      echo "Python package $dir should use the cloudops-* package name prefix" >&2
      exit 1
    fi
    continue
  fi

  if [[ "$LOGGED_IN" == "0" ]]; then
    login_codeartifact
    LOGGED_IN="1"
  fi

  if version_exists "$name" "$version"; then
    echo "Skipping ${name}@${version}: version already exists"
    continue
  fi

  echo "Publishing ${name}@${version} from $dir"
  pushd "$dir" >/dev/null
  rm -rf dist
  python -m build
  python -m twine upload --repository codeartifact --skip-existing dist/*
  popd >/dev/null
done
