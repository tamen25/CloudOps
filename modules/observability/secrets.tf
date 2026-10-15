#This file defines secrets settings for CloudOps.
#monitoring namespace — must exist before any kubernetes resources or helm releases
resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
    labels = {
      name = "monitoring"
    }
  }
}

#Creates the kubernetes namespace resource named application.
resource "kubernetes_namespace" "application" {
  metadata {
    name = var.application_namespace
    labels = {
      name = var.application_namespace
    }
  }
}

#OTel API key — 32-char alphanumeric bearer token.
#When var.otel_token_rotation_days > 0, the `keepers` map binds the token
#to a rotation-window bucket: floor((year*366 + day_of_year) / rotation_days).
#The outer floor() must wrap the *quotient*, not the numerator — pre-#95 it
#wrapped the numerator, so the keeper string changed daily.
#Force a manual rotation:
#  terraform apply -replace=module.observability.random_password.otel_api_key
resource "random_password" "otel_api_key" {
  length  = 32
  special = false

  keepers = var.otel_token_rotation_days > 0 ? {
    rotation_window = floor(
      (parseint(formatdate("YYYY", timestamp()), 10) * 366
        + parseint(formatdate("DDD", timestamp()), 10)
      ) / var.otel_token_rotation_days
    )
  } : null
}

#Creates the AWS secretsmanager secret resource named OTel API key.
resource "aws_secretsmanager_secret" "otel_api_key" {
  #checkov:skip=CKV_AWS_149:AWS managed key is acceptable for dev - CMK adds cost without meaningful security benefit
  #checkov:skip=CKV2_AWS_57:Rotation is driven by the random_password.otel_api_key `keepers` block (#95), not the SM Lambda rotation API. The keeper is bound to var.otel_token_rotation_days so new tokens land in this secret every window.
  name                    = "cloudops-otel-api-key"
  description             = "Bearer token for OTel Collector authentication"
  recovery_window_in_days = 0

  tags = local.common_tags
}

#Creates the AWS secretsmanager secret version resource named OTel API key.
resource "aws_secretsmanager_secret_version" "otel_api_key" {
  secret_id     = aws_secretsmanager_secret.otel_api_key.id
  secret_string = random_password.otel_api_key.result
}

#otel-auth in monitoring namespace — mounted as a file by the OTel Collector pod
#The bearertokenauth extension reads /etc/otel/auth/api-key
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

#otel-auth in the application namespace — injected as OTEL_API_KEY env var into order-api pods
#Kubernetes secretKeyRef cannot reference secrets across namespaces, so we maintain a copy here.
resource "kubernetes_secret" "otel_auth_application" {
  metadata {
    name      = "otel-auth"
    namespace = var.application_namespace
  }

  data = {
    api-key = random_password.otel_api_key.result
  }

  depends_on = [kubernetes_namespace.application]
}

#Grafana admin password — stored in AWS Secrets Manager and as a k8s secret
resource "random_password" "grafana_admin" {
  length  = 32
  special = false
}

#Creates the AWS secretsmanager secret resource named grafana admin.
resource "aws_secretsmanager_secret" "grafana_admin" {
  #checkov:skip=CKV_AWS_149:AWS managed key is acceptable for dev - CMK adds cost without meaningful security benefit
  #checkov:skip=CKV2_AWS_57:Automatic rotation not implemented - static credentials managed externally
  name                    = "cloudops-grafana-admin-password"
  description             = "Grafana admin password"
  recovery_window_in_days = 0

  tags = local.common_tags
}

#Creates the AWS secretsmanager secret version resource named grafana admin.
resource "aws_secretsmanager_secret_version" "grafana_admin" {
  secret_id     = aws_secretsmanager_secret.grafana_admin.id
  secret_string = random_password.grafana_admin.result
}

#Kubernetes secret referenced by Grafana helm release via admin.existingSecret
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
