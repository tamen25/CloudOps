#!/usr/bin/env bash
#This script runs publish java packages automation for CloudOps.
set -euo pipefail

MODE="publish"
if [[ "${1:-}" == "--check" ]]; then
  MODE="check"
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--check]" >&2
  exit 2
fi

PACKAGE_ROOT="${PACKAGE_ROOT:-libraries/java}"
CODEARTIFACT_REPOSITORY="${CODEARTIFACT_JAVA_REPOSITORY:-${CODEARTIFACT_REPOSITORY:-cloudops-java}}"

if [[ ! -d "$PACKAGE_ROOT" ]]; then
  echo "Java package root not found: $PACKAGE_ROOT"
  exit 0
fi

mapfile -t MANIFESTS < <(find "$PACKAGE_ROOT" -mindepth 2 -maxdepth 2 -name pom.xml -print | sort)

if [[ "${#MANIFESTS[@]}" -eq 0 ]]; then
  echo "No Java package manifests found under $PACKAGE_ROOT"
  exit 0
fi

#Reads pom field.
read_pom_field() {
  local field="$1"
  python -c "import xml.etree.ElementTree as ET; field='$field'; r=ET.parse('pom.xml').getroot(); matches=[e for e in r.iter() if e.tag.rsplit('}',1)[-1] == field]; e=matches[0] if matches else None; print(e.text.strip() if e is not None and e.text else '')"
}

#Ensures codeartifact config.
ensure_codeartifact_config() {
  if [[ -z "${CODEARTIFACT_DOMAIN:-}" ]]; then
    echo "CODEARTIFACT_DOMAIN is required for Java publish" >&2
    exit 1
  fi

  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI is required for Java publish" >&2
    exit 1
  fi

  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  export CODEARTIFACT_AUTH_TOKEN
  CODEARTIFACT_AUTH_TOKEN="$(aws codeartifact get-authorization-token \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --query authorizationToken \
    --output text)"

  export CODEARTIFACT_MAVEN_ENDPOINT
  CODEARTIFACT_MAVEN_ENDPOINT="$(aws codeartifact get-repository-endpoint \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY" \
    --format maven \
    --query repositoryEndpoint \
    --output text)"

  MAVEN_SETTINGS="$(mktemp)"
  export MAVEN_SETTINGS
  cat > "$MAVEN_SETTINGS" <<EOF
<settings>
  <servers>
    <server>
      <id>codeartifact</id>
      <username>aws</username>
      <password>${CODEARTIFACT_AUTH_TOKEN}</password>
    </server>
  </servers>
</settings>
EOF
}

#Handles version exists.
version_exists() {
  local group_id="$1"
  local artifact_id="$2"
  local version="$3"
  local owner="${CODEARTIFACT_DOMAIN_OWNER:-}"
  if [[ -z "$owner" ]]; then
    owner="$(aws sts get-caller-identity --query Account --output text)"
  fi

  aws codeartifact list-package-versions \
    --domain "$CODEARTIFACT_DOMAIN" \
    --domain-owner "$owner" \
    --repository "$CODEARTIFACT_REPOSITORY" \
    --format maven \
    --namespace "$group_id" \
    --package "$artifact_id" \
    --query "versions[?version=='$version'].version | [0]" \
    --output text 2>/dev/null | grep -qx "$version"
}

CONFIGURED="0"

for manifest in "${MANIFESTS[@]}"; do
  dir="$(dirname "$manifest")"

  pushd "$dir" >/dev/null
  group_id="$(read_pom_field "groupId")"
  artifact_id="$(read_pom_field "artifactId")"
  version="$(read_pom_field "version")"
  popd >/dev/null

  if [[ "$MODE" == "check" ]]; then
    echo "Found ${group_id}:${artifact_id}:${version} in $dir"
    if [[ "$group_id" != "com.cloudops" ]]; then
      echo "Java package $dir should use groupId com.cloudops" >&2
      exit 1
    fi
    continue
  fi

  if [[ "$CONFIGURED" == "0" ]]; then
    ensure_codeartifact_config
    CONFIGURED="1"
  fi

  if version_exists "$group_id" "$artifact_id" "$version"; then
    echo "Skipping ${group_id}:${artifact_id}:${version}: version already exists"
    continue
  fi

  echo "Publishing ${group_id}:${artifact_id}:${version} from $dir"
  pushd "$dir" >/dev/null
  mvn --settings "$MAVEN_SETTINGS" deploy
  popd >/dev/null
done
