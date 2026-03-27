# SLI/SLO PrometheusRule CRDs for order-api
# Implements the Google SRE Workbook multi-window multi-burn-rate alerting pattern.
#
# SLO 1 — Availability: 99.9% of requests must be non-5xx over 30 days
# SLO 2 — Latency:      95%  of requests must complete in < 300ms over 30 days
# SLO 3 — Throughput:   recording rule only (no SLO target)
#
# PrometheusRule CRDs are served by the prometheus-operator installed via
# kube-prometheus-stack (prometheus.tf). The `release: prometheus` label
# ensures the operator picks up these rules.

locals {
  # Formatted as fixed-point strings for safe PromQL interpolation.
  # Avoids floating-point representation noise (e.g. 0.9999999999 instead of 0.999).
  availability_target_str = format("%.4f", var.slo_availability_target) # "0.9990"
  latency_target_str      = format("%.4f", var.slo_latency_target)      # "0.9500"
}

# ─── SLO 1: Availability ─────────────────────────────────────────────────────
# SLI: proportion of non-5xx requests
# Target: var.slo_availability_target (default 99.9%)

resource "kubernetes_manifest" "slo_availability" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "order-api-slo-availability"
      namespace = "monitoring"
      labels = {
        release = "prometheus" # must match the operator's ruleSelector
        app     = "order-api"
        slo     = "true"
      }
    }
    spec = {
      groups = [
        # ── Recording rules: multi-window SLI ratios ──────────────────────
        {
          name     = "order-api.slo.availability.recording"
          interval = "30s"
          rules = [
            {
              record = "job:slo_availability:ratio_rate5m"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[5m])) / sum(rate(http_requests_total{job=\"order-api\"}[5m]))"
              labels = { service = "order-api", slo = "availability" }
            },
            {
              record = "job:slo_availability:ratio_rate30m"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[30m])) / sum(rate(http_requests_total{job=\"order-api\"}[30m]))"
              labels = { service = "order-api", slo = "availability" }
            },
            {
              record = "job:slo_availability:ratio_rate1h"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[1h])) / sum(rate(http_requests_total{job=\"order-api\"}[1h]))"
              labels = { service = "order-api", slo = "availability" }
            },
            {
              record = "job:slo_availability:ratio_rate6h"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[6h])) / sum(rate(http_requests_total{job=\"order-api\"}[6h]))"
              labels = { service = "order-api", slo = "availability" }
            },
            {
              record = "job:slo_availability:ratio_rate1d"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[1d])) / sum(rate(http_requests_total{job=\"order-api\"}[1d]))"
              labels = { service = "order-api", slo = "availability" }
            },
            {
              record = "job:slo_availability:ratio_rate3d"
              expr   = "sum(rate(http_requests_total{job=\"order-api\",status!~\"5..\"}[3d])) / sum(rate(http_requests_total{job=\"order-api\"}[3d]))"
              labels = { service = "order-api", slo = "availability" }
            },
            # Error budget remaining: fraction of 30-day budget left.
            # Uses the 3d burn rate as a proxy for recent trend.
            # Value 1.0 = full budget; 0.0 = budget exhausted; negative = SLO breached.
            {
              record = "job:slo_error_budget:availability_remaining"
              expr   = "1 - ((1 - job:slo_availability:ratio_rate3d) / (1 - ${local.availability_target_str}))"
              labels = { service = "order-api", slo = "availability" }
            },
          ]
        },

        # ── Alerting rules: multi-window multi-burn-rate ──────────────────
        {
          name = "order-api.slo.availability.alerts"
          rules = [
            # Fast burn — page immediately.
            # Burn rate > 14.4x means 2% of the 30d budget consumed in 1 hour.
            # Confirmed over both a 1h long window and a 5m short window to reduce
            # false positives from brief spikes.
            {
              alert = "SLOAvailabilityFastBurn"
              expr  = "((1 - job:slo_availability:ratio_rate1h) / (1 - ${local.availability_target_str})) > 14.4 and ((1 - job:slo_availability:ratio_rate5m) / (1 - ${local.availability_target_str})) > 14.4"
              for   = "2m"
              labels = {
                severity = "critical"
                slo      = "availability"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api availability SLO fast burn (>14.4x)"
                description = "order-api is consuming its availability error budget at more than 14.4x the allowed rate. At this rate the entire 30-day budget will be exhausted in ~2 hours. 1h burn rate: {{ $value | humanizePercentage }}."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-availability-fast-burn.md"
              }
            },

            # Slow burn — open a ticket.
            # Burn rate > 6x means 5% of the 30d budget consumed in 6 hours.
            # Confirmed over both a 6h long window and a 30m short window.
            {
              alert = "SLOAvailabilitySlowBurn"
              expr  = "((1 - job:slo_availability:ratio_rate6h) / (1 - ${local.availability_target_str})) > 6 and ((1 - job:slo_availability:ratio_rate30m) / (1 - ${local.availability_target_str})) > 6"
              for   = "15m"
              labels = {
                severity = "warning"
                slo      = "availability"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api availability SLO slow burn (>6x)"
                description = "order-api is consuming its availability error budget at more than 6x the allowed rate. At this rate the entire 30-day budget will be exhausted in ~5 days. 6h burn rate: {{ $value | humanizePercentage }}."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-availability-slow-burn.md"
              }
            },

            # Budget < 10% remaining — treat as critical; SLO breach imminent.
            {
              alert = "SLOAvailabilityBudgetCritical"
              expr  = "job:slo_error_budget:availability_remaining < 0.10"
              for   = "5m"
              labels = {
                severity = "critical"
                slo      = "availability"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api availability error budget critically low (<10%)"
                description = "Less than 10% of the 30-day availability error budget remains. Remaining: {{ $value | humanizePercentage }}. Immediate action required to avoid breaching the ${local.availability_target_str} SLO."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-error-budget-low.md"
              }
            },

            # Budget < 50% remaining — warning; investigate before it gets worse.
            {
              alert = "SLOAvailabilityBudgetLow"
              expr  = "job:slo_error_budget:availability_remaining < 0.50"
              for   = "5m"
              labels = {
                severity = "warning"
                slo      = "availability"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api availability error budget low (<50%)"
                description = "Less than 50% of the 30-day availability error budget remains. Remaining: {{ $value | humanizePercentage }}. Review recent error rates before the budget is critically depleted."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-error-budget-low.md"
              }
            },
          ]
        },
      ]
    }
  }

  depends_on = [helm_release.prometheus]
}

# ─── SLO 2: Latency ──────────────────────────────────────────────────────────
# SLI: proportion of requests completing in < 300ms
# Target: var.slo_latency_target (default 95%)

resource "kubernetes_manifest" "slo_latency" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "order-api-slo-latency"
      namespace = "monitoring"
      labels = {
        release = "prometheus"
        app     = "order-api"
        slo     = "true"
      }
    }
    spec = {
      groups = [
        # ── Recording rules: multi-window SLI ratios ──────────────────────
        {
          name     = "order-api.slo.latency.recording"
          interval = "30s"
          rules = [
            {
              record = "job:slo_latency:ratio_rate5m"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[5m])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[5m]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_latency:ratio_rate30m"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[30m])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[30m]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_latency:ratio_rate1h"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[1h])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[1h]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_latency:ratio_rate6h"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[6h])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[6h]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_latency:ratio_rate1d"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[1d])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[1d]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_latency:ratio_rate3d"
              expr   = "sum(rate(http_request_duration_seconds_bucket{job=\"order-api\",le=\"0.3\"}[3d])) / sum(rate(http_request_duration_seconds_count{job=\"order-api\"}[3d]))"
              labels = { service = "order-api", slo = "latency" }
            },
            {
              record = "job:slo_error_budget:latency_remaining"
              expr   = "1 - ((1 - job:slo_latency:ratio_rate3d) / (1 - ${local.latency_target_str}))"
              labels = { service = "order-api", slo = "latency" }
            },
          ]
        },

        # ── Alerting rules: multi-window multi-burn-rate ──────────────────
        {
          name = "order-api.slo.latency.alerts"
          rules = [
            # Fast burn — page immediately.
            {
              alert = "SLOLatencyFastBurn"
              expr  = "((1 - job:slo_latency:ratio_rate1h) / (1 - ${local.latency_target_str})) > 14.4 and ((1 - job:slo_latency:ratio_rate5m) / (1 - ${local.latency_target_str})) > 14.4"
              for   = "2m"
              labels = {
                severity = "critical"
                slo      = "latency"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api latency SLO fast burn (>14.4x)"
                description = "order-api is consuming its latency error budget at more than 14.4x the allowed rate. Fewer than expected requests are completing in <300ms. 1h burn rate: {{ $value | humanizePercentage }}."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-latency-fast-burn.md"
              }
            },

            # Slow burn — open a ticket.
            {
              alert = "SLOLatencySlowBurn"
              expr  = "((1 - job:slo_latency:ratio_rate6h) / (1 - ${local.latency_target_str})) > 6 and ((1 - job:slo_latency:ratio_rate30m) / (1 - ${local.latency_target_str})) > 6"
              for   = "15m"
              labels = {
                severity = "warning"
                slo      = "latency"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api latency SLO slow burn (>6x)"
                description = "order-api is consuming its latency error budget at more than 6x the allowed rate. 6h burn rate: {{ $value | humanizePercentage }}."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-latency-slow-burn.md"
              }
            },

            # Budget < 10% remaining — critical.
            {
              alert = "SLOLatencyBudgetCritical"
              expr  = "job:slo_error_budget:latency_remaining < 0.10"
              for   = "5m"
              labels = {
                severity = "critical"
                slo      = "latency"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api latency error budget critically low (<10%)"
                description = "Less than 10% of the 30-day latency error budget remains. Remaining: {{ $value | humanizePercentage }}. Immediate action required to avoid breaching the ${local.latency_target_str} SLO."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-error-budget-low.md"
              }
            },

            # Budget < 50% remaining — warning.
            {
              alert = "SLOLatencyBudgetLow"
              expr  = "job:slo_error_budget:latency_remaining < 0.50"
              for   = "5m"
              labels = {
                severity = "warning"
                slo      = "latency"
                service  = "order-api"
                team     = "cloudops"
              }
              annotations = {
                summary     = "order-api latency error budget low (<50%)"
                description = "Less than 50% of the 30-day latency error budget remains. Remaining: {{ $value | humanizePercentage }}."
                runbook_url = "https://github.com/tamen25/CloudOps/blob/main/docs/runbooks/slo-error-budget-low.md"
              }
            },
          ]
        },
      ]
    }
  }

  depends_on = [helm_release.prometheus]
}

# ─── SLO 3: Throughput ───────────────────────────────────────────────────────
# Recording rule only — no SLO target or alerting.
# Exposes request throughput for dashboards and capacity planning.

resource "kubernetes_manifest" "slo_throughput" {
  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "order-api-slo-throughput"
      namespace = "monitoring"
      labels = {
        release = "prometheus"
        app     = "order-api"
        slo     = "true"
      }
    }
    spec = {
      groups = [
        {
          name     = "order-api.slo.throughput.recording"
          interval = "30s"
          rules = [
            {
              record = "job:slo_throughput:rate5m"
              expr   = "sum(rate(http_requests_total{job=\"order-api\"}[5m]))"
              labels = { service = "order-api", slo = "throughput" }
            },
          ]
        },
      ]
    }
  }

  depends_on = [helm_release.prometheus]
}
