# monitoring namespace — must exist before any kubernetes resources or helm releases
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      name = "monitoring"
    }
  }
}

# OTel API key — 32-char alphanumeric token used by bearertokenauth extension
resource "random_password" "otel_api_key" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "otel_api_key" {
  name                    = "cloudops-otel-api-key"
  description             = "Bearer token for OTel Collector authentication"
  recovery_window_in_days = 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "otel_api_key" {
  secret_id     = aws_secretsmanager_secret.otel_api_key.id
  secret_string = random_password.otel_api_key.result
}

# otel-auth in monitoring namespace — mounted as a file by the OTel Collector pod
# The bearertokenauth extension reads /etc/otel/auth/api-key
resource "kubernetes_secret" "otel_auth" {
  metadata {
    name      = "otel-auth"
    namespace = "monitoring"
  }

  data = {
    api-key = random_password.otel_api_key.result
  }

  depends_on = [kubernetes_namespace.monitoring]
}

# otel-auth in cloudops namespace — injected as OTEL_API_KEY env var into order-api pods
# Kubernetes secretKeyRef cannot reference secrets across namespaces, so we maintain a copy here.
resource "kubernetes_secret" "otel_auth_cloudops" {
  metadata {
    name      = "otel-auth"
    namespace = "cloudops"
  }

  data = {
    api-key = random_password.otel_api_key.result
  }
}

# Grafana admin password — stored in AWS Secrets Manager and as a k8s secret
resource "random_password" "grafana_admin" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "grafana_admin" {
  name                    = "cloudops-grafana-admin-password"
  description             = "Grafana admin password"
  recovery_window_in_days = 0

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "grafana_admin" {
  secret_id     = aws_secretsmanager_secret.grafana_admin.id
  secret_string = random_password.grafana_admin.result
}

# Kubernetes secret referenced by Grafana helm release via admin.existingSecret
resource "kubernetes_secret" "grafana_admin" {
  metadata {
    name      = "grafana-admin-credentials"
    namespace = "monitoring"
  }

  data = {
    username = "admin"
    password = random_password.grafana_admin.result
  }

  depends_on = [kubernetes_namespace.monitoring]
}
