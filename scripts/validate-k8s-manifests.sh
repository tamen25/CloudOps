#!/usr/bin/env bash
#This script runs validate Kubernetes manifests automation for CloudOps.
#Renders apps/order-api/k8s AND apps/storefront/k8s with placeholder values
#and runs schema validation locally — closes backlog #35 + #79. Mirrors what
#.github/workflows/app.yml `manifest-validation` does in CI, so app
#manifest changes can be smoke-tested without pushing a PR.
#
#Tools used (auto-installed under .tools/ on first run):
#- kubeconform  v0.6.7  (preferred over kubeval — actively maintained,
#understands CRDs from the Kubernetes JSON Schema project)
#
#Usage:
#./scripts/validate-k8s-manifests.sh
#
#Override the kubeconform version with KUBECONFORM_VERSION=…
#Override the K8s API version with KUBE_VERSION=v1.32.0 (default).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

TOOLS_DIR="$REPO_ROOT/.tools"
KUBECONFORM_VERSION="${KUBECONFORM_VERSION:-0.6.7}"
KUBE_VERSION="${KUBE_VERSION:-1.32.0}"

mkdir -p "$TOOLS_DIR"

#── 1. Install kubeconform if missing ────────────────────────────────────────
KUBECONFORM_BIN="$TOOLS_DIR/kubeconform"
if [ ! -x "$KUBECONFORM_BIN" ]; then
  case "$(uname -s)" in
    Linux*)  os=linux ;;
    Darwin*) os=darwin ;;
    MINGW*|MSYS*|CYGWIN*) os=windows ;;
    *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "Unsupported arch: $(uname -m)" >&2; exit 1 ;;
  esac

  ext=tar.gz
  [ "$os" = "windows" ] && ext=zip

  url="https://github.com/yannh/kubeconform/releases/download/v${KUBECONFORM_VERSION}/kubeconform-${os}-${arch}.${ext}"
  echo "Downloading kubeconform v${KUBECONFORM_VERSION} from $url..."
  (
    cd "$TOOLS_DIR"
    if [ "$ext" = "tar.gz" ]; then
      curl -fsSL "$url" | tar -xz
    else
      tmp=$(mktemp -t kubeconform-XXXXXX.zip)
      curl -fsSL "$url" -o "$tmp"
      unzip -o "$tmp" -d .
      rm -f "$tmp"
      mv kubeconform.exe kubeconform 2>/dev/null || true
    fi
    chmod +x kubeconform
  )
fi

#── 2a. Render apps/order-api/k8s ────────────────────────────────────────────
ORDER_OUT="$(mktemp -d -t order-api-k8s-XXXXXX)"
trap 'rm -rf "$ORDER_OUT" "${STOREFRONT_OUT:-}"' EXIT

echo "Rendering apps/order-api/k8s → $ORDER_OUT ..."
ORDER_API_NAMESPACE=cloudops \
ORDER_API_SERVICE_ACCOUNT=order-api \
ORDER_API_IRSA_ROLE_ARN=arn:aws:iam::123456789012:role/cloudops-order-api-irsa \
ORDER_API_IMAGE=example.com/order-api@sha256:0000000000000000000000000000000000000000000000000000000000000000 \
ORDER_API_ENVIRONMENT=dev \
AWS_REGION=us-east-1 \
DB_NAME=cloudops \
DB_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:cloudops-db \
OTEL_ENDPOINT=https://otel.example.com \
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev \
ACM_CERT_ARN=arn:aws:acm:us-east-1:123456789012:certificate/example \
ORDER_API_HOST=api.example.com \
API_KEY_SECRET_ARN= \
IMAGE_TAG=local \
VPC_CIDR=10.0.0.0/16 \
OIDC_ISSUER= \
OIDC_AUDIENCE= \
OIDC_JWKS_URL= \
OIDC_REQUIRED_SCOPES= \
  apps/order-api/node_modules/.bin/tsx apps/order-api/scripts/render-k8s.ts apps/order-api/k8s "$ORDER_OUT"

#── 2b. Render apps/storefront/k8s ───────────────────────────────────────────
STOREFRONT_OUT="$(mktemp -d -t storefront-k8s-XXXXXX)"

echo "Rendering apps/storefront/k8s → $STOREFRONT_OUT ..."
STOREFRONT_NAMESPACE=storefront \
STOREFRONT_SERVICE_ACCOUNT=storefront \
STOREFRONT_IRSA_ROLE_ARN=arn:aws:iam::123456789012:role/cloudops-storefront-irsa \
STOREFRONT_IMAGE=example.com/storefront@sha256:0000000000000000000000000000000000000000000000000000000000000000 \
STOREFRONT_ENVIRONMENT=dev \
STOREFRONT_HOST=example.com \
STOREFRONT_API_BASE_URL=https://api.example.com \
STOREFRONT_SEARCH_BASE_URL=https://search.example.com \
STOREFRONT_WS_BASE_URL=wss://ws.example.com \
CART_TABLE_NAME= \
CHECKOUT_STATE_MACHINE_ARN= \
ORDER_API_NAMESPACE=cloudops \
AWS_REGION=us-east-1 \
ACM_CERT_ARN=arn:aws:acm:us-east-1:123456789012:certificate/example \
VPC_CIDR=10.0.0.0/16 \
OIDC_ISSUER= \
OIDC_AUDIENCE= \
OIDC_JWKS_URL= \
OIDC_HOSTED_UI= \
OIDC_CLIENT_ID= \
STOREFRONT_ORIGIN= \
OTEL_ENDPOINT=https://otel.example.com \
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev \
  apps/storefront/node_modules/.bin/tsx apps/storefront/scripts/render-k8s.ts apps/storefront/k8s "$STOREFRONT_OUT"

#── 3. Validate ──────────────────────────────────────────────────────────────
echo "Running kubeconform (kubernetes ${KUBE_VERSION}) on order-api..."
"$KUBECONFORM_BIN" \
  -strict \
  -kubernetes-version "$KUBE_VERSION" \
  -ignore-missing-schemas \
  -summary \
  "$ORDER_OUT"/*.yaml

echo "Running kubeconform (kubernetes ${KUBE_VERSION}) on storefront..."
"$KUBECONFORM_BIN" \
  -strict \
  -kubernetes-version "$KUBE_VERSION" \
  -ignore-missing-schemas \
  -summary \
  "$STOREFRONT_OUT"/*.yaml

echo
echo "✓ Manifests pass kubeconform (order-api + storefront)"
