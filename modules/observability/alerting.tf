# Grafana unified alerting — provisioned via ConfigMaps picked up by the
# sidecar container (grafana.tf sidecar.alerts config).
#
# Scope:
#   - Contact points: email to var.alert_email; SNS webhook if var.alert_sns_topic_arn set.
#   - Notification policies: root policy routes by severity label.
#   - Alert rules: re-uses the PrometheusRule CRDs in slo.tf as the source of
#     truth. Grafana alerts only adds things the operator can't do — cross-
#     datasource (Loki + Prom), RDS (CloudWatch), and SNS-bridged delivery.
#
# Prometheus-native alerts (slo.tf) continue to evaluate via the operator;
# Grafana subscribes to them via the Alertmanager datasource so operators
# have ONE alerts UI regardless of origin.

locals {
  alerting_provisioning = {
    apiVersion = 1
    contactPoints = concat(
      var.alert_email != "" ? [
        {
          orgId = 1
          name  = "default-email"
          receivers = [
            {
              uid                   = "email-default"
              type                  = "email"
              disableResolveMessage = false
              settings = {
                addresses   = var.alert_email
                singleEmail = false
              }
            },
          ]
        },
      ] : [],
      var.alert_sns_topic_arn != "" ? [
        {
          orgId = 1
          name  = "sns-webhook"
          receivers = [
            {
              uid                   = "sns-default"
              type                  = "webhook"
              disableResolveMessage = false
              settings = {
                # The self-healing module already exposes the SNS topic;
                # consumers connect to it via email/slack/pagerduty subscriptions.
                # Grafana sends JSON; an API Gateway in front of SNS is typical.
                url         = var.alert_webhook_url
                httpMethod  = "POST"
                maxAlerts   = 50
              }
            },
          ]
        },
      ] : [],
    )

    policies = [
      {
        orgId    = 1
        receiver = var.alert_email != "" ? "default-email" : (var.alert_webhook_url != "" ? "sns-webhook" : "grafana-default-email")
        group_by = ["grafana_folder", "alertname"]
        routes = [
          {
            receiver = var.alert_webhook_url != "" ? "sns-webhook" : "grafana-default-email"
            object_matchers = [
              ["severity", "=", "critical"],
            ]
            continue        = false
            group_wait      = "30s"
            group_interval  = "5m"
            repeat_interval = "1h"
          },
          {
            receiver = var.alert_email != "" ? "default-email" : "grafana-default-email"
            object_matchers = [
              ["severity", "=", "warning"],
            ]
            continue        = false
            group_wait      = "2m"
            group_interval  = "10m"
            repeat_interval = "6h"
          },
        ]
      },
    ]
  }
}

resource "kubernetes_config_map" "grafana_alerting_provisioning" {
  count = var.alert_email != "" || var.alert_webhook_url != "" ? 1 : 0

  metadata {
    name      = "grafana-alerting-provisioning"
    namespace = "monitoring"
    labels    = { grafana_alert = "1" }
  }

  data = {
    "alerting.yaml" = yamlencode(local.alerting_provisioning)
  }

  depends_on = [helm_release.grafana]
}

# Alertmanager datasource — points Grafana at the kube-prometheus-stack
# Alertmanager if it is enabled. When alertmanager.enabled=false (current
# default in prometheus.tf), this ConfigMap is still created but the upstream
# is non-functional until the operator's Alertmanager is turned on.
#
# The sidecar picks this up via the `grafana_datasource=1` label.
resource "kubernetes_config_map" "grafana_alertmanager_datasource" {
  metadata {
    name      = "grafana-alertmanager-datasource"
    namespace = "monitoring"
    labels    = { grafana_datasource = "1" }
  }

  data = {
    "alertmanager.yaml" = yamlencode({
      apiVersion = 1
      datasources = [
        {
          name      = "Alertmanager"
          type      = "alertmanager"
          uid       = "alertmanager"
          url       = "http://prometheus-kube-prometheus-alertmanager.monitoring.svc:9093"
          access    = "proxy"
          editable  = false
          jsonData = {
            handleGrafanaManagedAlerts = true
            implementation             = "prometheus"
          }
        },
      ]
    })
  }

  depends_on = [helm_release.grafana]
}
