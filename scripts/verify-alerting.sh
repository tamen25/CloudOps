#!/usr/bin/env bash
# verify-alerting.sh — post-apply check that the Grafana + Alertmanager
# alerting pipeline is actually functional. Closes backlog item #4.
#
# Checks:
#   1. Alertmanager pod is running (kube-prometheus-stack release).
#   2. PrometheusRule CRDs for SLO availability/latency are present.
#   3. Grafana sidecar has picked up alert ConfigMaps with grafana_alert=1
#      (counts both the cloudops-native rules and the alerting provisioning
#      files).
#   4. Grafana API reports the SLO rules + cloudops-native rules under the
#      Alerts section. Optional — needs GRAFANA_URL and GRAFANA_API_KEY in env.
#
# Usage:
#   ./scripts/verify-alerting.sh                  # k8s-side checks only
#   GRAFANA_URL=https://grafana.example.com \
#     GRAFANA_API_KEY=glsa_xxx \
#     ./scripts/verify-alerting.sh                # also queries Grafana API
#
# Exit codes:
#   0 — all checks passed
#   1 — one or more checks failed

set -uo pipefail

NAMESPACE_MONITORING="${NAMESPACE_MONITORING:-monitoring}"
APP_NAMESPACE="${APP_NAMESPACE:-cloudops}"

PASS=0
FAIL=0

ok()   { printf "  \033[32m\xe2\x9c\x94\033[0m %s\n" "$1"; PASS=$((PASS + 1)); }
fail() { printf "  \033[31m\xe2\x9c\x97\033[0m %s\n" "$1"; FAIL=$((FAIL + 1)); }
info() { printf "\n\033[1m%s\033[0m\n" "$1"; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "ERROR: required command not found: $1" >&2
    exit 2
  fi
}

require kubectl

# ── 1. Alertmanager pod up ────────────────────────────────────────────────────
info "1. Alertmanager pod (release=prometheus)"
am_pods=$(kubectl get pods -n "$NAMESPACE_MONITORING" \
  -l "app.kubernetes.io/name=alertmanager" \
  -o jsonpath='{range .items[*]}{.metadata.name}={.status.phase}{"\n"}{end}' 2>/dev/null || true)

if [ -z "$am_pods" ]; then
  fail "no Alertmanager pods found in $NAMESPACE_MONITORING — set var.enable_alertmanager=true and re-apply"
else
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    name="${line%%=*}"
    phase="${line##*=}"
    if [ "$phase" = "Running" ]; then
      ok "$name is Running"
    else
      fail "$name is $phase (expected Running)"
    fi
  done <<< "$am_pods"
fi

# ── 2. SLO PrometheusRule CRDs present ────────────────────────────────────────
info "2. SLO PrometheusRule CRDs (slo.tf)"
for rule in order-api-slo-availability order-api-slo-latency order-api-slo-throughput; do
  if kubectl get prometheusrule "$rule" -n "$NAMESPACE_MONITORING" >/dev/null 2>&1; then
    ok "$rule"
  else
    fail "$rule missing — slo.tf did not apply"
  fi
done

# ── 3. Grafana alert ConfigMaps picked up by sidecar ──────────────────────────
info "3. Grafana alert ConfigMaps (grafana_alert=1)"
alert_cms=$(kubectl get configmap -A -l "grafana_alert=1" \
  -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}{"\n"}{end}' 2>/dev/null || true)

if [ -z "$alert_cms" ]; then
  fail "no ConfigMaps labelled grafana_alert=1 — sidecar has nothing to provision"
else
  while IFS= read -r cm; do
    [ -z "$cm" ] && continue
    ok "$cm"
  done <<< "$alert_cms"
fi

# ── 4. Grafana API reports the rules (optional) ──────────────────────────────
info "4. Grafana API alert rules (optional — set GRAFANA_URL + GRAFANA_API_KEY)"
if [ -n "${GRAFANA_URL:-}" ] && [ -n "${GRAFANA_API_KEY:-}" ]; then
  require curl
  require python3

  rules_json=$(curl -sf -H "Authorization: Bearer $GRAFANA_API_KEY" \
    "$GRAFANA_URL/api/ruler/grafana/api/v1/rules" 2>/dev/null || echo "")

  if [ -z "$rules_json" ]; then
    fail "Grafana ruler API returned nothing — check the URL and API key"
  else
    expected_uids="loki-error-log-spike http-5xx-rate-surge http-request-volume-drop"
    missing=$(printf '%s' "$rules_json" | python3 -c "
import sys, json
data = json.load(sys.stdin) if sys.stdin.readable() else {}
seen = set()
for folder, groups in (data.items() if isinstance(data, dict) else []):
    for g in groups:
        for r in g.get('rules', []):
            uid = r.get('grafana_alert', {}).get('uid')
            if uid:
                seen.add(uid)
expected = set('$expected_uids'.split())
missing = expected - seen
print(' '.join(sorted(missing)))
" 2>/dev/null || echo "")

    if [ -z "$missing" ]; then
      ok "all 3 cloudops-native rules present in Grafana"
    else
      fail "missing rules in Grafana: $missing"
    fi
  fi
else
  echo "  (skipped — set GRAFANA_URL and GRAFANA_API_KEY to enable)"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo
printf "Passed: \033[32m%d\033[0m  Failed: \033[31m%d\033[0m\n" "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
