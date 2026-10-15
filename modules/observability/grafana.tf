#Grafana with auto-provisioned datasources and dashboard sidecar
resource "helm_release" "grafana" {
  name       = "grafana"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana"
  version    = "7.3.11"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode({
    #Admin credentials from the k8s secret created in secrets.tf
    admin = {
      existingSecret = kubernetes_secret.grafana_admin.metadata[0].name
      userKey        = "username"
      passwordKey    = "password"
    }

    persistence = {
      enabled          = true
      storageClassName = "gp3"
      size             = "10Gi"
    }

    #Auto-provision datasources on startup
    datasources = {
      "datasources.yaml" = {
        apiVersion = 1
        datasources = [
          {
            name      = "Prometheus"
            type      = "prometheus"
            uid       = "prometheus"
            url       = "http://prometheus-kube-prometheus-prometheus.monitoring.svc:9090"
            isDefault = true
            editable  = false
          },
          {
            name     = "Loki"
            type     = "loki"
            uid      = "loki"
            url      = "http://loki-gateway.loki.svc"
            editable = false
          },
          {
            name     = "Tempo"
            type     = "tempo"
            uid      = "tempo"
            url      = "http://tempo.tempo.svc:3100"
            editable = false
            jsonData = {
              tracesToLogsV2 = {
                datasourceUid      = "loki"
                spanStartTimeShift = "-1h"
                spanEndTimeShift   = "1h"
              }
              serviceMap = {
                datasourceUid = "prometheus"
              }
              lokiSearch = {
                datasourceUid = "loki"
              }
            }
          },
        ]
      }
    }

    #Sidecar watches for ConfigMaps across all namespaces:
    #grafana_dashboard=1           → dashboards (existing)
    #grafana_alert=1               → unified-alerting rules + contact points + policies
    #grafana_datasource=1          → extra datasources
    sidecar = {
      dashboards = {
        enabled         = true
        searchNamespace = "ALL"
        label           = "grafana_dashboard"
        labelValue      = "1"
        folder          = "/var/lib/grafana/dashboards"
        provider = {
          foldersFromFilesStructure = true
        }
      }
      alerts = {
        enabled         = true
        searchNamespace = "ALL"
        label           = "grafana_alert"
        labelValue      = "1"
        folder          = "/etc/grafana/provisioning/alerting"
        #Restart the Grafana pod whenever provisioning files change, since
        #Grafana does not hot-reload alerting provisioning on all versions.
        watchMethod = "WATCH"
      }
      datasources = {
        enabled         = true
        searchNamespace = "ALL"
        label           = "grafana_datasource"
        labelValue      = "1"
      }
    }

    #Ingress — ALB terminates TLS; Grafana runs plain HTTP inside the cluster
    ingress = {
      enabled = true
      annotations = {
        "kubernetes.io/ingress.class"               = "alb"
        "alb.ingress.kubernetes.io/scheme"          = "internet-facing"
        "alb.ingress.kubernetes.io/target-type"     = "ip"
        "alb.ingress.kubernetes.io/certificate-arn" = var.acm_cert_arn
        "alb.ingress.kubernetes.io/listen-ports"    = jsonencode([{ HTTPS = 443 }])
        "alb.ingress.kubernetes.io/group.name"      = "cloudops"
        "alb.ingress.kubernetes.io/ssl-redirect"    = "443"
      }
      hosts    = ["grafana.${var.domain}"]
      path     = "/"
      pathType = "Prefix"
    }

    grafana = {
      "ini" = {
        server = {
          root_url = "https://grafana.${var.domain}"
        }
        auth = {
          disable_login_form = false
        }
        #Unified Alerting is on by default in Grafana >= 9 — spelled out here
        #so the behaviour is obvious and can't drift on future upgrades.
        unified_alerting = {
          enabled = true
        }
        #Disable legacy alerting explicitly so both systems don't run side by side.
        alerting = {
          enabled = false
        }
      }
    }

    serviceMonitor = {
      enabled = true
    }
  })]

  depends_on = [
    kubernetes_secret.grafana_admin,
    kubernetes_storage_class.gp3,
    helm_release.prometheus,
    helm_release.loki,
    helm_release.tempo,
  ]
}

#── Grafana Service Account for SLO Lambda ────────────────────────────────────
#Creates a Viewer-role service account and API token in Grafana, then stores
#the token in AWS Secrets Manager so the SLO Lambda can authenticate with the
#Grafana Prometheus datasource proxy.
#
#Implementation note: The grafana/grafana Terraform provider requires the
#Grafana admin password at provider-init time, which creates a bootstrapping
#conflict because the password is generated within this same module.
#The null_resource approach avoids this by calling the Grafana REST API
#directly via curl after the Helm release is deployed and accessible.
#
#The null_resource re-runs if the Grafana URL or the secret ARN changes.
#Each run creates a new token (old tokens accumulate in Grafana but do not
#invalidate previous ones — clean up via the Grafana UI or API if needed).
#─────────────────────────────────────────────────────────────────────────────

resource "aws_secretsmanager_secret" "grafana_api_key" {
  #checkov:skip=CKV_AWS_149:AWS managed key is acceptable for dev - CMK adds cost without meaningful security benefit
  #checkov:skip=CKV2_AWS_57:Automatic rotation not implemented - static credentials managed externally
  name                    = "cloudops/grafana-api-key"
  description             = "Grafana Viewer service account token — used by the SLO Lambda to query Prometheus via the Grafana datasource proxy"
  recovery_window_in_days = 7

  tags = merge(var.tags, {
    Component = "observability"
    ManagedBy = "terraform"
  })
}

#Placeholder version written immediately so the secret ARN is usable as an
#output before the null_resource has had a chance to run.
#The lifecycle ignore_changes block prevents Terraform from overwriting the
#real token with the placeholder on subsequent applies.
resource "aws_secretsmanager_secret_version" "grafana_api_key_placeholder" {
  secret_id     = aws_secretsmanager_secret.grafana_api_key.id
  secret_string = "placeholder-replaced-by-grafana-service-account-provisioner"

  lifecycle {
    ignore_changes = [secret_string]
  }
}

#Provisions the Grafana service account and token via the REST API, then
#writes the token to the Secrets Manager secret created above.
#
#Requires on the executor machine:
#- curl
#- python3 (stdlib only)
#- aws CLI authenticated with secretsmanager:PutSecretValue on the secret ARN
#
#Idempotency + cleanup (closes part of backlog #20):
#- Service account named cloudops-lambda-reader is reused if it exists.
#- BEFORE creating a new token the script deletes every existing token on
#the same service account, so applies do not silently accumulate stale
#tokens in Grafana.
#- The trigger is now a fixed string ("v1") so re-applies do NOT rotate the
#token by default. To force rotation: `terraform apply
#-replace=module.observability.null_resource.grafana_service_account`.
resource "null_resource" "grafana_service_account" {
  triggers = {
    #Bump this string to force a token rotation on the next apply.
    rotation_marker = "v1"
  }

  provisioner "local-exec" {
    #Pass credentials via environment variables to avoid embedding them in
    #the command string (where they could appear in shell history or logs).
    environment = {
      GRAFANA_URL    = "https://grafana.${var.domain}"
      ADMIN_PASSWORD = random_password.grafana_admin.result
      SECRET_ARN     = aws_secretsmanager_secret.grafana_api_key.arn
      AWS_REGION     = var.region
    }

    command = <<-SCRIPT
      set -euo pipefail

      echo "Waiting for Grafana to become available at $GRAFANA_URL ..."
      for i in $(seq 1 36); do
        STATUS=$(curl -sk -o /dev/null -w "%%{http_code}" "$GRAFANA_URL/api/health" 2>/dev/null || echo "000")
        if [ "$STATUS" = "200" ]; then
          echo "Grafana is available (attempt $i)."
          break
        fi
        if [ "$i" = "36" ]; then
          echo "ERROR: Grafana did not become available after 6 minutes. Last HTTP status: $STATUS"
          exit 1
        fi
        echo "  Attempt $i/36 — HTTP $STATUS, retrying in 10s..."
        sleep 10
      done

      #── Idempotent: reuse existing service account if it already exists ──────
      echo "Checking for existing cloudops-lambda-reader service account..."
      SEARCH_RESP=$(curl -sf \
        -u "admin:$ADMIN_PASSWORD" \
        -H "Accept: application/json" \
        "$GRAFANA_URL/api/serviceaccounts/search?query=cloudops-lambda-reader&perpage=1" \
        2>/dev/null || echo '{"serviceAccounts":[]}')

      SA_ID=$(echo "$SEARCH_RESP" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    accounts = d.get('serviceAccounts', [])
    #Match exact name to avoid partial matches
    for sa in accounts:
        if sa.get('name') == 'cloudops-lambda-reader':
            print(sa['id'])
            break
except Exception:
    pass
" 2>/dev/null || echo "")

      if [ -z "$SA_ID" ]; then
        echo "Creating service account cloudops-lambda-reader (role: Viewer)..."
        SA_RESP=$(curl -sf -X POST "$GRAFANA_URL/api/serviceaccounts" \
          -u "admin:$ADMIN_PASSWORD" \
          -H "Content-Type: application/json" \
          -d '{"name":"cloudops-lambda-reader","role":"Viewer","isDisabled":false}')
        SA_ID=$(echo "$SA_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
        echo "Service account created with ID $SA_ID."
      else
        echo "Service account cloudops-lambda-reader already exists (ID $SA_ID) — reusing."
      fi

      #── Delete existing tokens on this SA to avoid silent accumulation ─────
      echo "Listing existing tokens on service account $SA_ID..."
      EXISTING=$(curl -sf -u "admin:$ADMIN_PASSWORD" \
        -H "Accept: application/json" \
        "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens" 2>/dev/null || echo '[]')

      echo "$EXISTING" | python3 -c "
import sys, json
try:
    for t in json.load(sys.stdin) or []:
        if t.get('id') is not None:
            print(t['id'])
except Exception:
    pass
" 2>/dev/null | while read -r OLD_ID; do
        [ -z "$OLD_ID" ] && continue
        echo "  Deleting stale token id $OLD_ID"
        curl -sf -X DELETE -u "admin:$ADMIN_PASSWORD" \
          "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens/$OLD_ID" >/dev/null 2>&1 || true
      done

      #── Create a new token ────────────────────────────────────────────────
      echo "Creating API token for service account $SA_ID..."
      TOKEN_NAME="cloudops-lambda-slo-$(date -u +%Y%m%d%H%M%S 2>/dev/null || date -u +%s)"
      TOKEN_RESP=$(curl -sf -X POST "$GRAFANA_URL/api/serviceaccounts/$SA_ID/tokens" \
        -u "admin:$ADMIN_PASSWORD" \
        -H "Content-Type: application/json" \
        -d "{\"name\":\"$TOKEN_NAME\"}")
      TOKEN=$(echo "$TOKEN_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")

      if [ -z "$TOKEN" ]; then
        echo "ERROR: Failed to extract token from Grafana response: $TOKEN_RESP"
        exit 1
      fi

      #── Store token in Secrets Manager ─────────────────────────────────────
      echo "Storing token in Secrets Manager ($SECRET_ARN)..."
      aws secretsmanager put-secret-value \
        --secret-id "$SECRET_ARN" \
        --secret-string "$TOKEN" \
        --region "$AWS_REGION"

      echo "Grafana service account cloudops-lambda-reader provisioned successfully."
      echo "Token name: $TOKEN_NAME"
    SCRIPT
  }

  depends_on = [
    helm_release.grafana,
    aws_secretsmanager_secret_version.grafana_api_key_placeholder,
  ]
}
