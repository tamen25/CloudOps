#!/usr/bin/env bash
# Builds CloudOps images and pushes them to the foundation stack's ECR
# repositories (modules/ecr), tagged with the commit they were built from.
# Prints the tfvars lines that point the platform stack at them.
#
# Usage: scripts/build-and-push.sh [image ...]     (default: every repository)
#   e.g. scripts/build-and-push.sh api-gateway pricing
#
# Needs: docker, aws, jq, and the foundation stack applied (STACK=foundation
# scripts/tf-init.sh first on a fresh checkout).
set -euo pipefail

cd "$(dirname "$0")/.."

for tool in docker aws jq terraform git; do
  command -v "$tool" >/dev/null || { echo "Error: $tool not found." >&2; exit 1; }
done

# Tags are immutable and name a commit, so the tree must match it.
if [ -n "$(git status --porcelain -- apps)" ]; then
  echo "Error: uncommitted changes under apps/. Commit them so the tag names what was built." >&2
  exit 1
fi
TAG=$(git rev-parse --short=12 HEAD)

URLS=$(terraform -chdir=stacks/foundation output -json ecr_repository_urls)
if [ "$(jq 'length' <<<"$URLS")" -eq 0 ]; then
  echo "Error: no ECR repositories in the foundation stack's outputs. Apply it first." >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  IMAGES=("$@")
else
  mapfile -t IMAGES < <(jq -r 'keys[]' <<<"$URLS")
fi

REGISTRY=$(jq -r 'first(.[])' <<<"$URLS" | cut -d/ -f1)
REGION=$(cut -d. -f4 <<<"$REGISTRY")
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

# The platform stack's variable for each mesh image.
declare -A TFVAR=(
  [api-gateway]=mesh_gateway_image [pricing]=mesh_pricing_image
  [inventory]=mesh_inventory_image [fraud]=mesh_fraud_image
  [payment]=mesh_payment_image [ledger]=mesh_ledger_image
  [projection-worker]=mesh_projection_image [loadgen]=mesh_loadgen_image
)

LINES=()
for image in "${IMAGES[@]}"; do
  url=$(jq -r --arg i "$image" '.[$i] // empty' <<<"$URLS")
  [ -n "$url" ] || { echo "Error: no repository for '$image'." >&2; exit 1; }
  [ -f "apps/$image/Dockerfile" ] || { echo "Error: apps/$image/Dockerfile not found." >&2; exit 1; }

  repo=${url#*/}
  if aws ecr describe-images --region "$REGION" --repository-name "$repo" --image-ids "imageTag=$TAG" >/dev/null 2>&1; then
    echo "$image:$TAG is already in ECR (tags are immutable); not rebuilt."
  else
    # EKS nodes are x86_64 (t3); build for them whatever this machine is.
    docker build --platform linux/amd64 -t "$url:$TAG" "apps/$image"
    docker push "$url:$TAG"
  fi
  if [ -n "${TFVAR[$image]:-}" ]; then
    LINES+=("${TFVAR[$image]} = \"$url:$TAG\"")
  fi
done

if [ "${#LINES[@]}" -gt 0 ]; then
  echo
  echo "# terraform.tfvars, for the platform stack:"
  printf '%s\n' "${LINES[@]}"
fi
