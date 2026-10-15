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

#── Mesh services (rendered with the api-gateway render-k8s.ts) ──────────────
#MESH_ONLY=1 skips order-api/storefront and validates just the mesh manifests
#(used by the mesh.yml workflow). Default renders everything.
MESH_OUT="$(mktemp -d -t mesh-k8s-XXXXXX)"

render_mesh() {
  local digest=sha256:0000000000000000000000000000000000000000000000000000000000000000
  for svc in api-gateway pricing inventory fraud payment ledger projection-worker loadgen; do
    echo "Rendering apps/${svc}/k8s → $MESH_OUT/${svc} ..."
    MESH_NAMESPACE=cloudops \
    MESH_ENVIRONMENT=dev \
    AWS_REGION=us-east-1 \
    LOG_LEVEL=info \
    OTEL_ENDPOINT=https://otel.example.com \
    OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev \
    OTEL_OTLP_HEADERS="Authorization=Bearer placeholder" \
    KINESIS_STREAM_NAME= \
    API_GATEWAY_REPLICAS=1 \
    API_GATEWAY_SERVICE_ACCOUNT=api-gateway \
    API_GATEWAY_IMAGE=example.com/api-gateway@${digest} \
    PRICING_REPLICAS=1 PRICING_SERVICE_ACCOUNT=pricing PRICING_IMAGE=example.com/pricing@${digest} \
    PRICING_URL=http://pricing.cloudops.svc.cluster.local \
    INVENTORY_REPLICAS=1 INVENTORY_SERVICE_ACCOUNT=inventory INVENTORY_IMAGE=example.com/inventory@${digest} \
    INVENTORY_URL=http://inventory.cloudops.svc.cluster.local INVENTORY_SEED_STOCK= \
    FRAUD_REPLICAS=1 FRAUD_SERVICE_ACCOUNT=fraud FRAUD_IMAGE=example.com/fraud@${digest} \
    FRAUD_URL=http://fraud.cloudops.svc.cluster.local \
    PAYMENT_REPLICAS=1 PAYMENT_SERVICE_ACCOUNT=payment PAYMENT_IMAGE=example.com/payment@${digest} \
    PAYMENT_URL=http://payment.cloudops.svc.cluster.local \
    LEDGER_REPLICAS=1 LEDGER_SERVICE_ACCOUNT=ledger LEDGER_IMAGE=example.com/ledger@${digest} \
    LEDGER_URL=http://ledger.cloudops.svc.cluster.local \
    PROJECTION_REPLICAS=1 PROJECTION_SERVICE_ACCOUNT=projection-worker PROJECTION_IMAGE=example.com/projection@${digest} \
    PROJECTION_POLL_INTERVAL_SECONDS=2 \
    LOADGEN_REPLICAS=1 LOADGEN_SERVICE_ACCOUNT=loadgen LOADGEN_IMAGE=example.com/loadgen@${digest} \
    CHAOS_ENABLED="" MESH_NAMESPACE=cloudops \
    GATEWAY_URL=http://api-gateway.cloudops.svc.cluster.local \
      apps/api-gateway/node_modules/.bin/tsx apps/api-gateway/scripts/render-k8s.ts \
      "apps/${svc}/k8s" "$MESH_OUT/${svc}"
  done
}

if [ "${MESH_ONLY:-0}" = "1" ]; then
  trap 'rm -rf "$MESH_OUT"' EXIT
  render_mesh
  echo "Running kubeconform (kubernetes ${KUBE_VERSION}) on mesh services..."
  "$KUBECONFORM_BIN" -strict -kubernetes-version "$KUBE_VERSION" -ignore-missing-schemas -summary \
    "$MESH_OUT"/*/*.yaml
  echo
  echo "✓ Mesh manifests pass kubeconform"
  exit 0
fi

#── 2a. Render apps/order-api/k8s ────────────────────────────────────────────
ORDER_OUT="$(mktemp -d -t order-api-k8s-XXXXXX)"
trap 'rm -rf "$ORDER_OUT" "${STOREFRONT_OUT:-}" "$MESH_OUT"' EXIT

echo "Rendering apps/order-api/k8s → $ORDER_OUT ..."
ORDER_API_NAMESPACE=cloudops \
ORDER_API_SERVICE_ACCOUNT=order-api \
ORDER_API_IRSA_ROLE_ARN=arn:aws:iam::123456789012:role/cloudops-order-api-irsa \
ORDER_API_IMAGE=example.com/order-api@sha256:0000000000000000000000000000000000000000000000000000000000000000 \
ORDER_API_ENVIRONMENT=dev \
ORDER_API_REPLICAS=2 \
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
KINESIS_STREAM_NAME= \
ALLOWED_ORIGINS= \
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
NEXT_PUBLIC_WS_BASE_URL=wss://ws.example.com \
CART_TABLE_NAME= \
REALTIME_CONNECTIONS_TABLE_NAME= \
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
PRIVACY_CONTACT_EMAIL=privacy@example.com \
STOREFRONT_API_RATE_LIMIT_WINDOW_MS=60000 \
STOREFRONT_API_IP_RATE_LIMIT_MAX=120 \
STOREFRONT_API_USER_RATE_LIMIT_MAX=60 \
STOREFRONT_AUTH_RATE_LIMIT_WINDOW_MS=60000 \
STOREFRONT_AUTH_IP_RATE_LIMIT_MAX=20 \
STOREFRONT_AUTH_BACKOFF_BASE_MS=1000 \
STOREFRONT_AUTH_BACKOFF_MAX_MS=60000 \
STOREFRONT_AUTH_BACKOFF_RESET_MS=900000 \
OTEL_ENDPOINT=https://otel.example.com \
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=dev \
TEMPO_URL=http://tempo.monitoring.svc.cluster.local:3200 \
MIMIR_URL=http://mimir.monitoring.svc.cluster.local:8080 \
LOKI_URL=http://loki.monitoring.svc.cluster.local:3100 \
LOADGEN_URL=http://loadgen.cloudops.svc.cluster.local \
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
