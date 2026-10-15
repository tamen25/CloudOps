#This file defines yace settings for CloudOps.
#yace — Yet Another CloudWatch Exporter.
#Scrapes AWS/RDS, AWS/ApplicationELB, AWS/NATGateway, AWS/Lambda, etc., and
#exposes them as Prometheus metrics so the existing Prom + Grafana + alerting
#stack can consume them uniformly. Closes backlog #14 (and supersedes #13:
#direct CW datasource hits the CW API on every dashboard load + every alert
#eval, expensive at scale).
#
#Activate by setting `var.enable_yace = true`. IRSA is auto-wired against the
#existing oidc provider; the helm chart runs in the `monitoring` namespace
#and is auto-discovered by the kube-prometheus-stack ServiceMonitor selector.

#── IRSA ─────────────────────────────────────────────────────────────────────

resource "aws_iam_role" "yace" {
  count = var.enable_yace ? 1 : 0

  name                 = "${local.name}-yace-irsa"
  permissions_boundary = var.permissions_boundary_arn

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${var.oidc_provider_url}:sub" = "system:serviceaccount:monitoring:yace"
          "${var.oidc_provider_url}:aud" = "sts.amazonaws.com"
        }
      }
    }]
  })

  tags = merge(local.common_tags, { Name = "${local.name}-yace-irsa" })
}

#Creates the AWS IAM role policy resource named yace.
resource "aws_iam_role_policy" "yace" {
  count = var.enable_yace ? 1 : 0

  name = "yace-cloudwatch-read"
  role = aws_iam_role.yace[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "tag:GetResources",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics",
        "cloudwatch:ListMetrics",
        "apigateway:GET",
        "aps:ListWorkspaces",
        "autoscaling:DescribeAutoScalingGroups",
        "dms:DescribeReplicationInstances",
        "dms:DescribeReplicationTasks",
        "ec2:DescribeTransitGatewayAttachments",
        "ec2:DescribeSpotFleetRequests",
        "shield:ListProtections",
        "storagegateway:ListGateways",
        "storagegateway:ListTagsForResource",
      ]
      Resource = "*"
    }]
  })
}

#── Helm release ─────────────────────────────────────────────────────────────

resource "helm_release" "yace" {
  count = var.enable_yace ? 1 : 0

  name       = "yace"
  repository = "https://nerdswords.github.io/helm-charts"
  chart      = "yet-another-cloudwatch-exporter"
  version    = "0.39.0"
  namespace  = "monitoring"

  timeout = 300

  values = [yamlencode({
    serviceAccount = {
      create = true
      name   = "yace"
      annotations = {
        "eks.amazonaws.com/role-arn" = aws_iam_role.yace[0].arn
      }
    }

    #Picked up by the kube-prometheus-stack ServiceMonitor selector
    #(release=prometheus + release-namespace=monitoring).
    serviceMonitor = {
      enabled  = true
      interval = "60s"
      labels   = { release = "prometheus" }
    }

    #Scrape config. Each job hits a single AWS/<namespace>; tag-based
    #discovery means RDS instances / ALBs / etc. are picked up automatically
    #as long as they have any tag (default behaviour).
    config = {
      apiVersion = "v1alpha1"
      sts-region = var.region
      discovery = {
        exportedTagsOnMetrics = {
          rds = ["Name", "Environment"]
          alb = ["Name", "Environment"]
        }
        jobs = [
          {
            type    = "AWS/RDS"
            regions = [var.region]
            period  = 300
            length  = 300
            metrics = [
              { name = "CPUCreditBalance", statistics = ["Average"] },
              { name = "CPUUtilization", statistics = ["Average"] },
              { name = "FreeableMemory", statistics = ["Average"] },
              { name = "FreeStorageSpace", statistics = ["Average"] },
              { name = "DatabaseConnections", statistics = ["Average", "Maximum"] },
              { name = "ReadIOPS", statistics = ["Average"] },
              { name = "WriteIOPS", statistics = ["Average"] },
              { name = "ReadLatency", statistics = ["Average"] },
              { name = "WriteLatency", statistics = ["Average"] },
            ]
          },
          {
            type    = "AWS/ApplicationELB"
            regions = [var.region]
            period  = 60
            length  = 300
            metrics = [
              { name = "HTTPCode_ELB_5XX_Count", statistics = ["Sum"] },
              { name = "HTTPCode_Target_5XX_Count", statistics = ["Sum"] },
              { name = "HTTPCode_ELB_4XX_Count", statistics = ["Sum"] },
              { name = "RequestCount", statistics = ["Sum"] },
              { name = "TargetResponseTime", statistics = ["Average", "p99"] },
              { name = "ActiveConnectionCount", statistics = ["Sum"] },
              { name = "RejectedConnectionCount", statistics = ["Sum"] },
              { name = "UnHealthyHostCount", statistics = ["Maximum"] },
            ]
          },
          {
            type    = "AWS/NATGateway"
            regions = [var.region]
            period  = 300
            length  = 300
            metrics = [
              { name = "BytesOutToDestination", statistics = ["Sum"] },
              { name = "ErrorPortAllocation", statistics = ["Sum"] },
              { name = "PacketsDropCount", statistics = ["Sum"] },
            ]
          },
          {
            type    = "AWS/Lambda"
            regions = [var.region]
            period  = 60
            length  = 300
            metrics = [
              { name = "Invocations", statistics = ["Sum"] },
              { name = "Errors", statistics = ["Sum"] },
              { name = "Duration", statistics = ["Average", "p99"] },
              { name = "Throttles", statistics = ["Sum"] },
            ]
          },
          #Storefront namespaces (#89): States (Step Functions), Kinesis,
          #ApiGateway, CloudFront, Cognito. yace surfaces each as
          #`aws_<namespace>_<metric>` in Prom.
          {
            type    = "AWS/States"
            regions = [var.region]
            period  = 60
            length  = 300
            metrics = [
              { name = "ExecutionsStarted", statistics = ["Sum"] },
              { name = "ExecutionsSucceeded", statistics = ["Sum"] },
              { name = "ExecutionsFailed", statistics = ["Sum"] },
              { name = "ExecutionsAborted", statistics = ["Sum"] },
              { name = "ExecutionsTimedOut", statistics = ["Sum"] },
              { name = "ExecutionTime", statistics = ["Average", "p99"] },
            ]
          },
          {
            type    = "AWS/Kinesis"
            regions = [var.region]
            period  = 60
            length  = 300
            metrics = [
              { name = "IncomingRecords", statistics = ["Sum"] },
              { name = "IncomingBytes", statistics = ["Sum"] },
              { name = "WriteProvisionedThroughputExceeded", statistics = ["Sum"] },
              { name = "GetRecords.IteratorAgeMilliseconds", statistics = ["Maximum"] },
            ]
          },
          {
            type    = "AWS/ApiGateway"
            regions = [var.region]
            period  = 60
            length  = 300
            metrics = [
              { name = "Count", statistics = ["Sum"] },
              { name = "4xx", statistics = ["Sum"] },
              { name = "5xx", statistics = ["Sum"] },
              { name = "Latency", statistics = ["Average", "p99"] },
              { name = "IntegrationLatency", statistics = ["Average", "p99"] },
            ]
          },
          {
            type    = "AWS/CloudFront"
            regions = ["us-east-1"]
            period  = 300
            length  = 600
            metrics = [
              { name = "Requests", statistics = ["Sum"] },
              { name = "4xxErrorRate", statistics = ["Average"] },
              { name = "5xxErrorRate", statistics = ["Average"] },
              { name = "OriginLatency", statistics = ["Average", "p99"] },
            ]
          },
          {
            type    = "AWS/Cognito"
            regions = [var.region]
            period  = 300
            length  = 300
            metrics = [
              { name = "SignInSuccesses", statistics = ["Sum"] },
              { name = "SignUpSuccesses", statistics = ["Sum"] },
              { name = "TokenRefreshSuccesses", statistics = ["Sum"] },
              { name = "FederationSuccesses", statistics = ["Sum"] },
            ]
          },
        ]
      }
    }

    resources = {
      requests = { cpu = "50m", memory = "128Mi" }
      limits   = { cpu = "500m", memory = "512Mi" }
    }
  })]

  depends_on = [
    aws_iam_role_policy.yace,
    helm_release.prometheus,
  ]
}

#── PrometheusRule: CloudWatch-sourced alerts ────────────────────────────────
#Now that yace exposes AWS/RDS + AWS/ApplicationELB metrics in Prom, the
#alerts the user originally wanted in backlog #3 (RDS CPU credits, ALB 5xx)
#are evaluated by the Prom operator alongside the SLO rules.

resource "kubernetes_manifest" "yace_alerts" {
  count = var.enable_yace ? 1 : 0

  manifest = {
    apiVersion = "monitoring.coreos.com/v1"
    kind       = "PrometheusRule"
    metadata = {
      name      = "cloudwatch-yace-alerts"
      namespace = "monitoring"
      labels = {
        release = "prometheus"
        source  = "yace"
      }
    }
    spec = {
      groups = [
        {
          name = "cloudwatch.rds"
          rules = [
            {
              alert = "RDSCPUCreditBalanceLow"
              expr  = "aws_rds_cpucredit_balance_average < 60"
              for   = "10m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "RDS burstable credit balance < 60 ({{ $labels.dbinstance_identifier }})"
                description = "Burstable RDS instance about to throttle to baseline. Current balance: {{ $value }}."
                runbook_url = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/master-runbook.md"
              }
            },
            {
              alert = "RDSFreeStorageLow"
              expr  = "aws_rds_free_storage_space_average < 2e9"
              for   = "5m"
              labels = {
                severity = "critical"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "RDS free storage < 2 GB ({{ $labels.dbinstance_identifier }})"
                description = "Free storage: {{ $value | humanize1024 }}B. Resize before write traffic causes a hard stop."
              }
            },
          ]
        },
        {
          name = "cloudwatch.alb"
          rules = [
            {
              alert = "ALB5xxRateHigh"
              expr  = "sum by (load_balancer) (rate(aws_applicationelb_httpcode_elb_5_xx_count_sum[5m])) > 5"
              for   = "5m"
              labels = {
                severity = "critical"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "ALB 5xx rate > 5/s ({{ $labels.load_balancer }})"
                description = "Public ALB returning >5 5xx responses/s sustained for 5m. Likely upstream target failure or LB misconfig."
                runbook_url = "https://github.com/your-org/your-repo/blob/main/docs/runbooks/slo-fast-burn.md"
              }
            },
            {
              alert = "ALBUnhealthyHosts"
              expr  = "max by (target_group) (aws_applicationelb_un_healthy_host_count_maximum) > 0"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "ALB target group has unhealthy hosts ({{ $labels.target_group }})"
                description = "{{ $value }} unhealthy host(s) sustained for 5m."
              }
            },
          ]
        },
        {
          name = "cloudwatch.storefront"
          rules = [
            {
              alert = "KinesisLagHigh"
              expr  = "max by (stream_name) (aws_kinesis_get_records_iteratorage_milliseconds_maximum) > 60000"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "Kinesis iterator age >60s ({{ $labels.stream_name }})"
                description = "WS fanout is falling behind. Real-time updates will lag."
              }
            },
            {
              alert = "KinesisLagCritical"
              expr  = "max by (stream_name) (aws_kinesis_get_records_iteratorage_milliseconds_maximum) > 300000"
              for   = "5m"
              labels = {
                severity = "critical"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "Kinesis iterator age >5m ({{ $labels.stream_name }})"
                description = "WS fanout cannot keep up; consumer rebalancing or scale-up required."
              }
            },
            {
              alert = "SFExecutionFailureHigh"
              expr  = "sum(rate(aws_states_executions_failed_sum[10m])) / clamp_min(sum(rate(aws_states_executions_started_sum[10m])), 1) > 0.05"
              for   = "10m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "Step Functions failure rate >5%"
                description = "Checkout saga executions failing — investigate upstream order-api or compensation logic."
              }
            },
            {
              alert = "WSFanoutErrorHigh"
              expr  = "sum(rate(aws_lambda_errors_sum{function_name=~\".+ws-fanout\"}[5m])) / clamp_min(sum(rate(aws_lambda_invocations_sum{function_name=~\".+ws-fanout\"}[5m])), 1) > 0.01"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "ws-fanout error rate >1%"
                description = "Realtime updates are being dropped. Check Dynamo throttles or stale conns."
              }
            },
            {
              alert = "CloudFront5xxHigh"
              expr  = "avg(aws_cloudfront_5xx_error_rate_average) > 1"
              for   = "5m"
              labels = {
                severity = "warning"
                team     = "cloudops"
                source   = "cloudwatch"
              }
              annotations = {
                summary     = "CloudFront 5xx error rate >1%"
                description = "Asset CDN is returning errors. Check origin bucket policy + image-resize Lambda."
              }
            },
          ]
        },
      ]
    }
  }

  depends_on = [helm_release.yace]
}
