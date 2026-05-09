<!-- This document explains 002 single alb ingress for CloudOps. -->
# ADR 002 — Single ALB with Kubernetes Ingress Rules

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

CloudOps exposes multiple services externally: the order-api application, the Grafana dashboard, and the OTel Collector endpoint (both HTTP and gRPC). Each of these needs TLS termination and a public DNS record.

The naive approach — one ALB per service — would mean at least three ALBs. ALBs are not cheap at idle: ~$16/month minimum per load balancer, plus $0.008/LCU-hour for processed traffic. More importantly, each ALB requires its own ACM certificate, its own Route 53 A record management, and its own security group rules. Three ALBs means three times the Terraform resource count and three times the DNS propagation surface.

The alternative is the AWS Load Balancer Controller's IngressGroup feature, which allows multiple `Ingress` resources to share a single ALB via the `alb.ingress.kubernetes.io/group.name` annotation.

## Decision

We use a single ALB per environment, shared across all Kubernetes `Ingress` resources via IngressGroup.

The AWS Load Balancer Controller (installed as a Helm chart in the ingress module with IRSA-based access to create and update ALB resources) manages the ALB lifecycle. Each Ingress object declares its group name and order:

- Order-api Ingress: `group.name=cloudops-app`, `group.order=10`
- Grafana Ingress: `group.name=cloudops-app`, `group.order=20`
- OTel HTTP Ingress: `group.name=cloudops-otel`, `group.order=10`
- OTel gRPC Ingress: `group.name=cloudops-otel`, `group.order=20`

The Load Balancer Controller reconciles all Ingresses in the group into a single ALB with listener rules. Host-based routing (`api.example.com` vs `grafana.example.com` vs `otel.example.com`) handles traffic distribution to the correct backend service.

Route 53 simplification is significant. With a single ALB, the `alb_dns_name` and `alb_zone_id` values are determined once (after the first ingress deploy), stored in `terraform.tfvars`, and reused as alias targets for all Route 53 A records. Adding a new subdomain is a one-line `aws_route53_record` resource — no new load balancer provisioned.

The OTel gRPC ingress required a specific annotation: `alb.ingress.kubernetes.io/backend-protocol=GRPC` with `alb.ingress.kubernetes.io/conditions.otel-grpc` to match only POST requests. This is possible because ALB natively supports HTTP/2 forwarding to gRPC backends, something that would have required either a separate NLB or a custom configuration if we used a different load balancer type.

One real trade-off: IngressGroups create an implicit coupling between services at the load balancer level. If the order-api team and the observability team are operating independently, they now share an ALB. An IAM permission boundary or namespace restriction might be needed in a multi-team setup. For a single-team project this is not a concern.

## Consequences

**Positive:**
- ~$32-48/month saved vs three separate ALBs
- Single ACM wildcard certificate (`*.example.com`) covers all subdomains
- One `alb_dns_name` variable drives all Route 53 records — adding a new service is a one-liner
- ALB access logs go to a single S3 prefix, simplifying SIEM ingestion
- gRPC-native backend protocol support available without a separate NLB

**Negative:**
- The `alb_dns_name` and `alb_zone_id` two-pass deploy pattern is unavoidable: the first apply creates the ALB, the second apply uses its DNS name for Route 53 records and OTel Ingress routing. The `terraform.tfvars.example` documents this explicitly
- An ALB outage affects all services simultaneously — though this is also true of any shared infrastructure tier
- IngressGroup sharing means the Load Balancer Controller must have permission to modify the shared ALB; scoping this to per-team ALBs is not possible with a single group
