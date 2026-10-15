#Closes backlog #104 — alert when JWKS becomes unreachable.
#
#The order-api increments jwt_verify_total{outcome="jwks_unreachable"} when
#jose fails to fetch the IdP's JWKS (DNS / network / 5xx from Cognito).
#Cognito JWKS outages have happened historically; the cluster looks fine
#(pods are Up, RDS is Up) but every Bearer auth call returns 401. This
#rule fires inside two minutes so an operator can fall back to API-key
#auth or page Cognito support.
#
#Alert fires at >0.1 fetch failures/sec sustained 2m — a sane floor that
#ignores single jose retries from transient TCP resets but catches a real
#outage immediately.
#
#The companion `jwt_verify_total{outcome="ok"}` rate provides a green
#baseline; if both are 0 the service has no real auth traffic and the
#alert is naturally silent.
resource "kubernetes_manifest" "jwks_reachability_alerts" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "order-api-jwks-reachability"
      namespace = "monitoring"
      labels = {
        release = "prometheus" # must match the operator's ruleSelector
        app     = "order-api"
        slo     = "auth"
      }
    }
    spec = {
      groups = [
        {
          name     = "order-api.auth.jwks"
          interval = "30s"
          rules = [
            {
              alert = "OIDCJWKSUnreachable"
              expr  = "rate(jwt_verify_total{outcome=\"jwks_unreachable\"}[2m]) > 0.1"
              for   = "2m"
              labels = {
                severity = "critical"
                service  = "order-api"
                slo      = "auth"
              }
              annotations = {
                summary     = "Order-api cannot reach the OIDC JWKS endpoint"
                description = "{{ $value | printf \"%.2f\" }} JWKS-fetch failures/sec for 2+ minutes. Every Bearer-auth request is failing 401. Check the IdP (Cognito User Pool) JWKS URL reachability and DNS resolution from the order-api pods."
                runbook     = "kubectl exec -n cloudops deploy/order-api -- wget -qO- $OIDC_JWKS_URL  # should return JSON keys[]"
              }
            },
            #Sanity counter — JWT auth is being exercised at all. Useful
            #for confirming the OIDCJWKSUnreachable rule has live traffic
            #to alert on; if this is flat the cluster is in API-key-only
            #mode and the JWKS alert is benignly silent.
            {
              record = "order_api:jwt_verify_rate5m"
              expr   = "sum by (outcome) (rate(jwt_verify_total[5m]))"
              labels = { service = "order-api" }
            },
          ]
        },
      ]
    }
  }
}
