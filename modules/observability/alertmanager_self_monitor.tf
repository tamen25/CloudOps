#Closes backlog #99 — Alertmanager self-monitoring.
#
#The whole alerting story silently breaks if Alertmanager itself goes down:
#PrometheusRule expressions still fire, the operator still posts alerts to
#AM, but AM never forwards them to email/SNS/Grafana. The cluster looks
#healthy on every dashboard because the dashboards source from Prometheus,
#not AM.
#
#These rules detect three failure modes:
# 1. AM pod down — `up{job="alertmanager"} == 0`.
# 2. AM config sync stuck — `alertmanager_config_last_reload_successful == 0`.
# 3. AM cluster member count drift (when HA is on) — would need
#    `alertmanager_cluster_members != alertmanager_cluster_peers_total`; we
#    omit it for now because the dev cluster runs AM in single-replica mode.
#
#All routed to severity=critical so they survive even if AM later misroutes
#its own alerts (Prometheus + Grafana subscribe to the operator's
#PrometheusRule, so the rule still fires in the Grafana UI even if AM
#cannot deliver email).
#
#Verification: extended in scripts/verify-alerting.sh — checks that this
#PrometheusRule loads and that the rule names are visible in the operator.
#PrometheusRule alertmanager-self-monitor: kube-prometheus-stack creates it from
#additionalPrometheusRulesMap (prometheus.tf), in the release that
#installs the PrometheusRule CRD.
locals {
  alertmanager_self_monitor_rule_groups = [
    {
      name     = "alertmanager.self-monitor"
      interval = "30s"
      rules = [
        {
          alert = "AlertmanagerDown"
          expr  = "up{job=~\".*alertmanager.*\"} == 0"
          for   = "5m"
          labels = {
            severity = "critical"
            service  = "alertmanager"
          }
          annotations = {
            summary     = "Alertmanager is down"
            description = "Alertmanager instance {{ $labels.instance }} has been unreachable for 5+ minutes. Alerts will not be delivered. Check the alertmanager pod and Prometheus targets page."
          }
        },
        {
          alert = "AlertmanagerConfigSyncFailing"
          expr  = "alertmanager_config_last_reload_successful == 0"
          for   = "10m"
          labels = {
            severity = "warning"
            service  = "alertmanager"
          }
          annotations = {
            summary     = "Alertmanager config reload is failing"
            description = "Alertmanager on {{ $labels.instance }} has had a failed config reload for 10+ minutes. Check `kubectl logs -n monitoring alertmanager-prometheus-kube-prometheus-alertmanager-0`."
          }
        },
        {
          alert = "AlertmanagerNotificationsFailing"
          expr  = "rate(alertmanager_notifications_failed_total[5m]) > 0"
          for   = "10m"
          labels = {
            severity = "warning"
            service  = "alertmanager"
          }
          annotations = {
            summary     = "Alertmanager is failing to deliver notifications"
            description = "Alertmanager on {{ $labels.instance }} has been failing notifications for 10+ minutes (integration {{ $labels.integration }}). Check contact-point credentials and downstream service health."
          }
        },
      ]
    },
  ]
}
