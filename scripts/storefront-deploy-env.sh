#!/usr/bin/env bash
# Prints the storefront's render variables as KEY=value lines, from the
# stacks' Terraform outputs and terraform.tfvars, for storefront.yml's
# deploy job ($GITHUB_ENV) or a manual render:
#
#   bash scripts/storefront-deploy-env.sh > /tmp/storefront.env
#
# Needs terraform.tfvars at the repo root (CI writes it with
# scripts/write-ci-tfvars.sh) and access to the state bucket. Fails, naming
# the output, when one the storefront cannot run without is empty.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f terraform.tfvars ]; then
  bash scripts/write-ci-tfvars.sh >&2
fi
bash scripts/terraform-stacks.sh init >&2

out() { terraform -chdir="stacks/$1" output -raw "$2" 2>/dev/null || true; }
need() {
  local value
  value=$(out "$1" "$2")
  if [ -z "$value" ]; then
    echo "Error: stacks/$1 output $2 is empty; is that part of the platform enabled?" >&2
    exit 1
  fi
  printf '%s' "$value"
}
tfvar() {
  grep -E "^[[:space:]]*$1[[:space:]]*=" terraform.tfvars | sed 's/.*= *"\(.*\)".*/\1/' | head -1 || true
}

DOMAIN=$(tfvar domain_name)
ENVIRONMENT=$(tfvar environment)
NAMESPACE=$(tfvar storefront_namespace)
SERVICE_ACCOUNT=$(tfvar storefront_service_account)
ORDER_API_NAMESPACE=$(tfvar order_api_namespace)
MESH_NAMESPACE=$(tfvar mesh_namespace)
VPC_CIDR=$(tfvar vpc_cidr)
SUBDOMAIN=$(tfvar storefront_subdomain)
CONTACT=$(tfvar privacy_contact_email)
CLUSTER=$(need cluster cluster_name)
HOST=${SUBDOMAIN:-shop}.${DOMAIN}
# Required values are read before the heredoc: a failure inside a command
# substitution in a heredoc does not stop the script.
IRSA_ROLE_ARN=$(need platform storefront_cart_irsa_role_arn)
API_BASE_URL=$(need platform order_api_url)
CART_TABLE=$(need platform storefront_cart_table_name)
ACM_CERT=$(need platform acm_certificate_arn)

cat <<EOF
EKS_CLUSTER_NAME=${CLUSTER}
STOREFRONT_NAMESPACE=${NAMESPACE:-storefront}
STOREFRONT_SERVICE_ACCOUNT=${SERVICE_ACCOUNT:-storefront}
STOREFRONT_IRSA_ROLE_ARN=${IRSA_ROLE_ARN}
STOREFRONT_ENVIRONMENT=${ENVIRONMENT:-dev}
STOREFRONT_HOST=${HOST}
STOREFRONT_ORIGIN=https://${HOST}
STOREFRONT_API_BASE_URL=${API_BASE_URL}
STOREFRONT_SEARCH_BASE_URL=$(out platform storefront_search_api_endpoint)
STOREFRONT_WS_BASE_URL=$(out platform storefront_realtime_ws_url)
NEXT_PUBLIC_WS_BASE_URL=$(out platform storefront_realtime_ws_url)
CART_TABLE_NAME=${CART_TABLE}
REALTIME_CONNECTIONS_TABLE_NAME=$(out platform storefront_realtime_connections_table_name)
CHECKOUT_STATE_MACHINE_ARN=$(out platform storefront_checkout_state_machine_arn)
ORDER_API_NAMESPACE=${ORDER_API_NAMESPACE:-cloudops}
ACM_CERT_ARN=${ACM_CERT}
VPC_CIDR=${VPC_CIDR:-10.0.0.0/16}
OIDC_ISSUER=$(out platform cognito_issuer_url)
OIDC_AUDIENCE=$(out platform cognito_storefront_client_id)
OIDC_CLIENT_ID=$(out platform cognito_storefront_client_id)
OIDC_JWKS_URL=$(out platform cognito_jwks_url)
OIDC_HOSTED_UI=$(out platform cognito_hosted_ui_domain)
PRIVACY_CONTACT_EMAIL=${CONTACT:-privacy@${DOMAIN}}
STOREFRONT_API_RATE_LIMIT_WINDOW_MS=60000
STOREFRONT_API_IP_RATE_LIMIT_MAX=120
STOREFRONT_API_USER_RATE_LIMIT_MAX=60
STOREFRONT_AUTH_RATE_LIMIT_WINDOW_MS=60000
STOREFRONT_AUTH_IP_RATE_LIMIT_MAX=20
STOREFRONT_AUTH_BACKOFF_BASE_MS=1000
STOREFRONT_AUTH_BACKOFF_MAX_MS=60000
STOREFRONT_AUTH_BACKOFF_RESET_MS=900000
OTEL_ENDPOINT=$(out platform otel_endpoint)
OTEL_RESOURCE_ATTRIBUTES=deployment.environment=${ENVIRONMENT:-dev},k8s.cluster.name=${CLUSTER}
TEMPO_URL=$(out platform tempo_url)
MIMIR_URL=$(out platform mimir_url)
LOKI_URL=$(out platform loki_url)
LOADGEN_URL=http://loadgen.${MESH_NAMESPACE:-cloudops}.svc.cluster.local
AWS_REGION=${AWS_REGION:-$(tfvar region)}
EOF
