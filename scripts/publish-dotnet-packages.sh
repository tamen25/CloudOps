#!/usr/bin/env bash
#This script runs publish dotnet packages automation for CloudOps.
set -euo pipefail

MODE="publish"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

PACKAGE_ROOT="${PACKAGE_ROOT:-libraries/dotnet}"
CODEARTIFACT_REPOSITORY="${CODEARTIFACT_DOTNET_REPOSITORY:-${CODEARTIFACT_REPOSITORY:-cloudops-dotnet}}"
NUGET_SOURCE_NAME="${NUGET_SOURCE_NAME:-codeartifact}"

if [[ ! -d "$PACKAGE_ROOT" ]]; then
  echo ".NET package root not found: $PACKAGE_ROOT"
  exit 0
fi

mapfile -t MANIFESTS < <(find "$PACKAGE_ROOT" -mindepth 2 -maxdepth 2 -name '*.csproj' -print | sort)

if [[ "${#MANIFESTS[@]}" -eq 0 ]]; then
  echo "No .NET package manifests found under $PACKAGE_ROOT"
  exit 0
fi

#Reads csproj field.
read_csproj_field() {
  local field="$1"
  python -c "import xml.etree.ElementTree as ET; r=ET.parse('$PROJECT_FILE').getroot(); e=r.find('.//$field'); print(e.text.strip() if e is not None and e.text else '')"
}

#Ensures codeartifact source.
ensure_codeartifact_source() {
  if [[ -z "${CODEARTIFACT_DOMAIN:-}" ]]; then
    echo "CODEARTIFACT_DOMAIN is required for .NET publish" >&2
    exit 1
  fi

  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI is required for .NET publish" >&2
    exit 1
  fi

  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  CODEARTIFACT_AUTH_TOKEN="$(aws codeartifact get-authorization-token \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --query authorizationToken \
    --output text)"
  export CODEARTIFACT_AUTH_TOKEN

  CODEARTIFACT_NUGET_ENDPOINT="$(aws codeartifact get-repository-endpoint \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY" \
    --format nuget \
    --query repositoryEndpoint \
    --output text)"
  export CODEARTIFACT_NUGET_ENDPOINT

  dotnet nuget remove source "$NUGET_SOURCE_NAME" >/dev/null 2>&1 || true
  dotnet nuget add source "${CODEARTIFACT_NUGET_ENDPOINT}v3/index.json" \
    --name "$NUGET_SOURCE_NAME" \
    --username aws \
    --password "$CODEARTIFACT_AUTH_TOKEN" \
    --store-password-in-clear-text
}

#Handles version exists.
version_exists() {
  local package_id="$1"
  local version="$2"
  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  aws codeartifact list-package-versions \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY" \
    --format nuget \
    --package "$package_id" \
    --query "versions[?version=='$version'].version | [0]" \
    --output text 2>/dev/null | grep -qx "$version"
}

CONFIGURED="0"

for manifest in "${MANIFESTS[@]}"; do
  dir="$(dirname "$manifest")"
  PROJECT_FILE="$(basename "$manifest")"

  pushd "$dir" >/dev/null
  package_id="$(read_csproj_field "PackageId")"
  version="$(read_csproj_field "Version")"
  popd >/dev/null

  if [[ "$MODE" == "check" ]]; then
    echo "Found ${package_id}@${version} in $dir"
    if [[ "$package_id" != CloudOps.* ]]; then
      echo ".NET package $dir should use the CloudOps.* package ID prefix" >&2
      exit 1
    fi
    continue
  fi

  if [[ "$CONFIGURED" == "0" ]]; then
    ensure_codeartifact_source
    CONFIGURED="1"
  fi

  if version_exists "$package_id" "$version"; then
    echo "Skipping ${package_id}@${version}: version already exists"
    continue
  fi

  echo "Publishing ${package_id}@${version} from $dir"
  pushd "$dir" >/dev/null
  dotnet pack "$PROJECT_FILE" --configuration Release
  for package_file in bin/Release/*.nupkg; do
    dotnet nuget push "$package_file" --source "$NUGET_SOURCE_NAME" --api-key "$CODEARTIFACT_AUTH_TOKEN" --skip-duplicate
  done
  popd >/dev/null
done
