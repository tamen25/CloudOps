#This file defines security dashboard settings for CloudOps.
#Security Posture Grafana Dashboard + Security SLO PrometheusRule
#
#1. ConfigMap: picked up by the Grafana sidecar (label grafana_dashboard=1,
#searchNamespace=ALL) and provisioned into Grafana on startup. Loads the
#security-posture dashboard JSON from modules/observability/dashboards/.
#
#2. PrometheusRule: evaluated by the kube-prometheus-stack Prometheus instance
#(matched via release=prometheus label). Recording rules and alerts assume
#the following metrics are published by the compliance-scanner and
#auto-remediation Lambdas via the OTel Collector running in the monitoring
#namespace:
#security_findings_open_total{severity, check_category, source}
#security_mttd_seconds{severity}          — gauge per Lambda invocation
#security_mttr_seconds{outcome}           — gauge per remediation attempt
#security_auto_remediation_total{outcome} — counter: success | failure
#
#Dashboard prerequisite: panels query CloudWatch namespace CloudOps/Security
#and CloudWatch Logs Insights. A CloudWatch datasource with uid="cloudwatch"
#must be added to the datasources list in modules/observability/grafana.tf:
#
#{
#name     = "AWS CloudWatch"
#type     = "cloudwatch"
#uid      = "cloudwatch"
#jsonData = { defaultRegion = var.region }
#editable = false
#}

resource "kubernetes_config_map" "security_posture_dashboard" {
  metadata {
    name      = "security-posture-dashboard"
    namespace = "monitoring"
    labels = {
      grafana_dashboard = "1"
    }
  }

  data = {
    "security-posture.json" = file("${path.module}/../observability/dashboards/security-posture.json")
  }
}

#Creates the kubernetes manifest resource named security SLO rules.
resource "kubernetes_manifest" "security_slo_rules" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "security-slo-rules"
      namespace = "monitoring"
      labels = {
        #Matches the ruleSelector in the kube-prometheus-stack Prometheus CR
        release = "prometheus"
      }
    }
    spec = {
      groups = [
        #── Recording rules ──────────────────────────────────────────────────
        {
          name     = "security.recording_rules"
          interval = "60s"
          rules = [
            #MTTD: average detection time in seconds across all findings in
            #the last 5-minute window, labelled by severity. The
            #security_mttd_seconds gauge is published once per Lambda
            #invocation with the severity of the finding just detected.
            {
              record = "job:security_mttd:avg"
              expr   = "avg_over_time(security_mttd_seconds[5m])"
              labels = { job = "security" }
            },

            #MTTR: average auto-remediation time in seconds, outcome=success
            #only — failed remediations don't contribute to MTTR.
            {
              record = "job:security_mttr:avg"
              expr   = "avg_over_time(security_mttr_seconds{outcome=\"success\"}[5m])"
              labels = { job = "security" }
            },

            #Auto-remediation success rate: success / (success + failure).
            #The 1e-9 guard term avoids division-by-zero when no attempts
            #have been recorded in the window.
            {
              record = "job:security_auto_remediation_success_rate:ratio"
              expr   = "rate(security_auto_remediation_total{outcome=\"success\"}[5m]) / (rate(security_auto_remediation_total{outcome=\"success\"}[5m]) + rate(security_auto_remediation_total{outcome=\"failure\"}[5m]) + 1e-9)"
              labels = { job = "security" }
            },
          ]
        },

        #── Alerts ───────────────────────────────────────────────────────────
        {
          name = "security.alerts"
          rules = [
            #Alert 1: MTTD for CRITICAL findings > 5 minutes (300 seconds)
            #Fires if the rolling average detection time for CRITICAL severity
            #stays above the SLO threshold for 2 consecutive minutes.
            {
              alert = "SecurityCriticalMTTDBreached"
              expr  = "job:security_mttd:avg{severity=\"CRITICAL\"} > 300"
              for   = "2m"
              labels = {
                severity = "critical"
                team     = "security"
              }
              annotations = {
                summary     = "CRITICAL finding MTTD exceeds 5-minute SLO"
                description = "Mean time to detect CRITICAL security findings is {{ $value | humanizeDuration }}, above the 300-second (5 min) SLO threshold. Check the compliance scanner Lambda and CloudWatch Logs."
                runbook     = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/security-mttd-breach.md"
              }
            },

            #Alert 2: MTTR for auto-remediable HIGH findings > 15 minutes
            #Fires if the rolling average successful remediation time stays
            #above the SLO threshold for 5 consecutive minutes.
            {
              alert = "SecurityAutoRemediationMTTRBreached"
              expr  = "job:security_mttr:avg > 900"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "security"
              }
              annotations = {
                summary     = "Auto-remediation MTTR exceeds 15-minute SLO"
                description = "Mean time to auto-remediate is {{ $value | humanizeDuration }}, above the 900-second (15 min) SLO threshold. Check the auto-remediation Lambda logs."
                runbook     = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/security-mttr-breach.md"
              }
            },

            #Alert 3: More than 5 CRITICAL findings open simultaneously.
            #Fires after 1 minute to allow the auto-remediation Lambda one
            #invocation window to begin work before paging.
            {
              alert = "SecurityCriticalFindingsThresholdExceeded"
              expr  = "sum(security_findings_open_total{severity=\"CRITICAL\"}) > 5"
              for   = "1m"
              labels = {
                severity = "critical"
                team     = "security"
              }
              annotations = {
                summary     = "More than 5 CRITICAL security findings open simultaneously"
                description = "{{ $value }} CRITICAL findings are currently open. Immediate triage required. Review the Security Posture dashboard and DynamoDB findings table."
                runbook     = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/security-critical-findings.md"
              }
            },

            #Alert 4: Auto-remediation failure rate > 20%.
            #Fires after 5 minutes of sustained failure to avoid transient
            #noise from single-invocation errors.
            {
              alert = "SecurityAutoRemediationHighFailureRate"
              expr  = "(1 - job:security_auto_remediation_success_rate:ratio) > 0.20"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "security"
              }
              annotations = {
                summary     = "Auto-remediation failure rate exceeds 20%"
                description = "Auto-remediation success rate has dropped below 80%. Current failure rate: {{ printf \"%.0f\" (mul $value 100) }}%. Check Lambda errors and IAM permissions."
                runbook     = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/security-auto-remediation-failures.md"
              }
            },
          ]
        },
      ]
    }
  }
}
