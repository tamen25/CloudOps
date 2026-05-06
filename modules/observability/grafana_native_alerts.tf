#  Grafana-native alert rules — provisioned via the sidecar (`grafana_alert=1`).
#
#  These complement the Prometheus-operator-managed PrometheusRule CRDs in
#  slo.tf. Use Grafana-native rules when:
#   - the query crosses datasources (Loki + Prom) — operator can't,
#   - the alert needs Grafana templating/contact-point routing the operator
#     doesn't own,
#   - the rule is high-signal but doesn't earn SLO-grade burn-rate machinery.
#
#  Three rules ship here:
#   1. Loki log-volume spike  — error/warn lines in the app namespace exceed a
#      threshold over 10m. Catches noisy regressions before they show up as 5xx.
#   2. HTTP 5xx surge         — service-level 5xx ratio > 5% for 5m. More
#      sensitive than the SLO availability fast-burn (>14.4x); fires earlier.
#   3. HTTP request-volume drop — service went silent (rate ~ 0) while the same
#      window was healthy 1h ago. Catches cases where SLO ratios stay 1.0
#      because the denominator collapsed too.
#
#  CloudWatch-sourced alerts (RDS CPUCreditBalance, ALB 5xx) are out of scope
#  here — Grafana doesn't have a CloudWatch datasource configured (no IRSA),
#  so those rules can't evaluate yet. CloudWatch metric alarms in
#  modules/database/cloudwatch.tf already cover the data plane; SNS wiring is
#  a separate follow-up.

locals {
  # Pin all three rules to the same group so Grafana evaluates them in lockstep
  # and they share the same alertmanager pipeline.
  grafana_alert_rules = {
    apiVersion = 1
    groups = [
      {
        orgId    = 1
        name     = "cloudops-grafana-native"
        folder   = "cloudops"
        interval = "1m"
        rules = [
          # ── 1. Loki log-volume spike ───────────────────────────────────────
          {
            uid       = "loki-error-log-spike"
            title     = "Application error log spike"
            condition = "C"
            data = [
              {
                refId         = "A"
                datasourceUid = "loki"
                relativeTimeRange = {
                  from = 600
                  to   = 0
                }
                model = {
                  refId         = "A"
                  expr          = "sum(count_over_time({namespace=\"${var.application_namespace}\"} |~ \"(?i)error|exception|fatal\"[5m]))"
                  queryType     = "range"
                  intervalMs    = 1000
                  maxDataPoints = 43200
                }
              },
              {
                refId         = "B"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "B"
                  type       = "reduce"
                  reducer    = "last"
                  expression = "A"
                }
              },
              {
                refId         = "C"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "C"
                  type       = "threshold"
                  expression = "B"
                  conditions = [{
                    evaluator = {
                      params = [50]
                      type   = "gt"
                    }
                    operator = { type = "and" }
                    query    = { params = ["B"] }
                    reducer  = { type = "last", params = [] }
                    type     = "query"
                  }]
                }
              },
            ]
            noDataState  = "OK"
            execErrState = "Alerting"
            for          = "10m"
            labels = {
              severity = "warning"
              service  = "order-api"
              team     = "cloudops"
              source   = "grafana"
            }
            annotations = {
              summary     = "order-api error log volume spike (>50 lines/5m)"
              description = "Error/exception/fatal log lines in namespace ${var.application_namespace} crossed 50 over the last 5m. Inspect Loki for the dominant error message before this becomes a 5xx surge."
              runbook_url = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/log-error-spike.md"
            }
          },

          # ── 2. HTTP 5xx error-rate surge ───────────────────────────────────
          {
            uid       = "http-5xx-rate-surge"
            title     = "HTTP 5xx error-rate surge"
            condition = "C"
            data = [
              {
                refId         = "A"
                datasourceUid = "prometheus"
                relativeTimeRange = {
                  from = 600
                  to   = 0
                }
                model = {
                  refId         = "A"
                  expr          = "sum(rate(http_requests_total{job=\"order-api\",status=~\"5..\"}[5m])) / clamp_min(sum(rate(http_requests_total{job=\"order-api\"}[5m])), 1)"
                  instant       = false
                  range         = true
                  intervalMs    = 1000
                  maxDataPoints = 43200
                }
              },
              {
                refId         = "B"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "B"
                  type       = "reduce"
                  reducer    = "last"
                  expression = "A"
                }
              },
              {
                refId         = "C"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "C"
                  type       = "threshold"
                  expression = "B"
                  conditions = [{
                    evaluator = {
                      params = [0.05]
                      type   = "gt"
                    }
                    operator = { type = "and" }
                    query    = { params = ["B"] }
                    reducer  = { type = "last", params = [] }
                    type     = "query"
                  }]
                }
              },
            ]
            noDataState  = "OK"
            execErrState = "Alerting"
            for          = "5m"
            labels = {
              severity = "critical"
              service  = "order-api"
              team     = "cloudops"
              source   = "grafana"
            }
            annotations = {
              summary     = "order-api 5xx rate above 5% for 5m"
              description = "Service-level 5xx ratio is above 5% sustained over 5 minutes. SLO fast-burn requires >14.4x error budget consumption — this rule fires earlier so an operator can intercept the regression before SLO machinery escalates."
              runbook_url = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/slo-fast-burn.md"
            }
          },

          # ── 3. HTTP request-volume drop ────────────────────────────────────
          {
            uid       = "http-request-volume-drop"
            title     = "HTTP request volume dropped to zero"
            condition = "C"
            data = [
              {
                refId         = "A"
                datasourceUid = "prometheus"
                relativeTimeRange = {
                  from = 600
                  to   = 0
                }
                model = {
                  refId         = "A"
                  expr          = "sum(rate(http_requests_total{job=\"order-api\"}[5m])) < bool 0.1 and sum(rate(http_requests_total{job=\"order-api\"}[5m] offset 1h)) > bool 1"
                  instant       = false
                  range         = true
                  intervalMs    = 1000
                  maxDataPoints = 43200
                }
              },
              {
                refId         = "B"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "B"
                  type       = "reduce"
                  reducer    = "last"
                  expression = "A"
                }
              },
              {
                refId         = "C"
                datasourceUid = "__expr__"
                relativeTimeRange = {
                  from = 0
                  to   = 0
                }
                model = {
                  refId      = "C"
                  type       = "threshold"
                  expression = "B"
                  conditions = [{
                    evaluator = {
                      params = [0]
                      type   = "gt"
                    }
                    operator = { type = "and" }
                    query    = { params = ["B"] }
                    reducer  = { type = "last", params = [] }
                    type     = "query"
                  }]
                }
              },
            ]
            noDataState  = "OK"
            execErrState = "Alerting"
            for          = "5m"
            labels = {
              severity = "critical"
              service  = "order-api"
              team     = "cloudops"
              source   = "grafana"
            }
            annotations = {
              summary     = "order-api request volume collapsed (~0 rps, was healthy 1h ago)"
              description = "order-api request rate has dropped to near zero while the same window 1h ago was healthy. SLO availability ratios can stay near 1.0 in this case because the denominator collapsed alongside the numerator. Investigate ingress / DNS / upstream client connectivity."
              runbook_url = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/master-runbook.md"
            }
          },
        ]
      },
    ]
  }
}

resource "kubernetes_config_map" "grafana_native_alert_rules" {
  metadata {
    name      = "grafana-native-alert-rules"
    namespace = "monitoring"
    labels    = { grafana_alert = "1" }
  }

  data = {
    "cloudops-native-alerts.yaml" = yamlencode(local.grafana_alert_rules)
  }

  depends_on = [helm_release.grafana]
}
