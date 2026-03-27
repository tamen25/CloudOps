# Kubernetes NetworkPolicies
#
# cloudops namespace:
#   order-api  — ingress from kube-system (ALB) on 3000;
#                egress to RDS (db_subnet_cidrs:5432), OTel (monitoring:4318),
#                Secrets Manager VPC endpoint (vpc_cidr:443), CoreDNS (kube-system:53)
#
# monitoring namespace:
#   otel-collector — ingress from cloudops (4317+4318) and internet/ALB (4318)
#   grafana        — ingress from internet/ALB (3000)
#   prometheus     — ingress from monitoring namespace only
#   (all pods)     — egress allow-all (Prometheus must scrape across namespaces)
#
# Note on ALB target-type=ip: traffic arrives at pods from the ALB's VPC interface IPs,
# not from the LBC pod. The kube-system namespace_selector below matches LBC health checks
# from within the cluster; external ALB traffic uses the ipBlock rules.

# ═══════════════════════════════════════════════════════════════════════════════
# cloudops — order-api ingress + egress
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_network_policy" "order_api" {
  metadata {
    name      = "order-api"
    namespace = "cloudops"
  }

  spec {
    pod_selector {
      match_labels = { app = "order-api" }
    }

    policy_types = ["Ingress", "Egress"]

    # ── Ingress ────────────────────────────────────────────────────────────────
    # Allow from kube-system namespace (ALB health checks + LBC probes) on port 3000.
    # External ALB-to-pod traffic also originates from kube-system subnets in ip-target mode.
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "kube-system"
          }
        }
      }
      ports {
        port     = "3000"
        protocol = "TCP"
      }
    }

    # ── Egress: RDS ────────────────────────────────────────────────────────────
    # Allow TCP 5432 to each DB subnet CIDR. Skipped if db_subnet_cidrs is empty.
    dynamic "egress" {
      for_each = length(var.db_subnet_cidrs) > 0 ? [1] : []
      content {
        dynamic "to" {
          for_each = var.db_subnet_cidrs
          content {
            ip_block { cidr = to.value }
          }
        }
        ports {
          port     = "5432"
          protocol = "TCP"
        }
      }
    }

    # ── Egress: OTel Collector ─────────────────────────────────────────────────
    # Allow TCP 4318 to the OTel gateway in the monitoring namespace.
    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "monitoring"
          }
        }
      }
      ports {
        port     = "4318"
        protocol = "TCP"
      }
    }

    # ── Egress: AWS VPC endpoints (Secrets Manager, ECR, etc.) ────────────────
    # All AWS VPC interface endpoints are reachable at port 443 within the VPC CIDR.
    egress {
      to {
        ip_block { cidr = var.vpc_cidr }
      }
      ports {
        port     = "443"
        protocol = "TCP"
      }
    }

    # ── Egress: CoreDNS ────────────────────────────────────────────────────────
    # Allow both UDP and TCP port 53 to kube-system (CoreDNS).
    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "kube-system"
          }
        }
      }
      ports {
        port     = "53"
        protocol = "UDP"
      }
      ports {
        port     = "53"
        protocol = "TCP"
      }
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# monitoring — OTel Collector ingress
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_network_policy" "otel_collector_ingress" {
  metadata {
    name      = "otel-collector-ingress"
    namespace = "monitoring"
  }

  spec {
    pod_selector {
      match_labels = {
        "app.kubernetes.io/name" = "opentelemetry-collector"
      }
    }

    policy_types = ["Ingress"]

    # gRPC (4317): cluster-internal clients in cloudops namespace only
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "cloudops"
          }
        }
      }
      ports {
        port     = "4317"
        protocol = "TCP"
      }
    }

    # HTTP (4318): cloudops namespace pods AND internet via ALB (0.0.0.0/0).
    # Multiple `from` entries in a single ingress rule are OR'd.
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "cloudops"
          }
        }
      }
      from {
        ip_block { cidr = "0.0.0.0/0" }
      }
      ports {
        port     = "4318"
        protocol = "TCP"
      }
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# monitoring — Grafana ingress
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_network_policy" "grafana_ingress" {
  metadata {
    name      = "grafana-ingress"
    namespace = "monitoring"
  }

  spec {
    pod_selector {
      match_labels = {
        "app.kubernetes.io/name" = "grafana"
      }
    }

    policy_types = ["Ingress"]

    # Allow from internet via ALB on port 3000 (Grafana's HTTP port in the chart).
    # ALB forwards to pod IPs directly in ip-target mode.
    ingress {
      from {
        ip_block { cidr = "0.0.0.0/0" }
      }
      ports {
        port     = "3000"
        protocol = "TCP"
      }
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# monitoring — Prometheus ingress
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_network_policy" "prometheus_ingress" {
  metadata {
    name      = "prometheus-ingress"
    namespace = "monitoring"
  }

  spec {
    pod_selector {
      match_labels = {
        "app.kubernetes.io/name" = "prometheus"
      }
    }

    policy_types = ["Ingress"]

    # Allow only from within the monitoring namespace: Grafana datasource queries,
    # Alertmanager, OTel remote-write, etc.
    ingress {
      from {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "monitoring"
          }
        }
      }
    }
  }
}

# ═══════════════════════════════════════════════════════════════════════════════
# monitoring — allow all egress
# Prometheus scrapes ServiceMonitors across all namespaces; Loki, Tempo, and
# Grafana also make cross-namespace and external calls. Allow all egress for the
# entire monitoring namespace.
# ═══════════════════════════════════════════════════════════════════════════════

resource "kubernetes_network_policy" "monitoring_egress" {
  metadata {
    name      = "allow-all-egress"
    namespace = "monitoring"
  }

  spec {
    # Empty pod_selector matches ALL pods in the namespace
    pod_selector {}

    policy_types = ["Egress"]

    # Empty egress rule = allow all egress traffic (Kubernetes NetworkPolicy semantics)
    egress {}
  }
}
