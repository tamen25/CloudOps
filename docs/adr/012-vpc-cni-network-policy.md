<!-- This document explains 012 VPC cni network policy for CloudOps. -->
# ADR 012 — AWS VPC CNI Network Policy Now, Cilium Service Mesh Later

**Status:** Accepted
**Date:** 2026-05-09
**Authors:** CloudOps platform

---

## Context

By default, an EKS cluster running the AWS VPC CNI does not enforce
Kubernetes `NetworkPolicy`. Pods can talk to any other pod in the cluster
regardless of policy rules. We had `NetworkPolicy` resources defined for
order-api, the OTel Collector, and Grafana (default-deny + explicit
allow), but they were policy-as-documentation: nothing was actually
blocking traffic.

The two options to make those policies enforced were:

1. **Switch CNIs.** Replace AWS VPC CNI with Cilium. Cilium enforces
   `NetworkPolicy` natively and adds L7 + mTLS via Hubble/eBPF. This is
   the "service mesh" path that lets us also tackle backlog #9 (mTLS
   service-to-service).
2. **Stay on VPC CNI and turn on its built-in policy enforcer.** AWS VPC
   CNI v1.14+ ships an eBPF-based network policy engine. Setting
   `enableNetworkPolicy = "true"` in the addon config switches it on
   without changing the CNI.

A CNI swap on a live cluster is destructive: every node has to drain and
rejoin under the new CNI, IPAM behavior shifts, and several operational
patterns change at once (pod IP scoping, security group attachments,
prefix delegation). For a project still proving prod-equivalence (the
backlog #46–#52 batch) and running on a single dev cluster, we judged
that the CNI swap blast radius is too large to take on the same week
we are turning on RLS, OIDC, and private EKS endpoints.

The VPC CNI built-in option is functionally equivalent for plain
`NetworkPolicy` enforcement. It does not give us mTLS or L7 — those need
a service mesh layer (Cilium, Linkerd, Istio). But it ships
`NetworkPolicy` enforcement today without re-architecting the data plane.

ALB → pod traffic also informed the call. With the AWS Load Balancer
Controller's `target-type: ip`, the ALB writes packets directly to pod
IPs sourced from the ALB's ENIs. Source matching for those flows needs an
`ipBlock`, not a `kube-system` namespaceSelector. Both Cilium and the VPC
CNI policy enforcer treat the same way; the policy authors had to update
the rules either way (#26).

## Decision

Turn on AWS VPC CNI built-in `NetworkPolicy` enforcement now. Defer the
service mesh decision to backlog #9.

`modules/eks/addons.tf` sets `configuration_values =
jsonencode({ enableNetworkPolicy = "true" })` on the `aws_eks_addon.vpc_cni`
resource. The eBPF enforcer is per-node; no extra controllers are needed.

ALB allow-rules in `modules/security/network_policies.tf` and
`apps/order-api/k8s/networkpolicy.yaml` use `ipBlock { cidr = var.vpc_cidr }`
because the ALB ENI is in-VPC. Pod-to-pod rules (Prometheus scrapes on
9090, OTel collector on 4318) keep their namespaceSelector form.

Egress is explicit. `apps/order-api/k8s/networkpolicy.yaml` ships a
default-deny egress policy plus a tightly scoped allow list (DNS to
kube-system 53, RDS 5432 to VPC, AWS APIs 443 anywhere, OTel 4317/4318 to
monitoring). Egress regressions surface in dev instead of being masked.

## Consequences

**Positive:**
- `NetworkPolicy` is actually enforced; the policies under
  `modules/security/network_policies.tf` are no longer documentation.
- No data plane swap. Operational patterns (IPAM, prefix delegation,
  pod-level security groups) are unchanged.
- Default-deny egress in dev catches misconfiguration earlier than prod.

**Negative:**
- No mTLS service-to-service. Pod-to-pod traffic is still cleartext.
- No L7 / HTTP-aware controls. We can match on namespace/IP/port, not on
  paths or methods.
- We will eventually need a mesh for #9. When we do, the policies written
  for the VPC CNI enforcer will mostly carry over but the data plane will
  change. Plan for one migration, not two iterations.

**Revisit when:** backlog #9 is unblocked (mTLS becomes a concrete
requirement) or AWS releases an in-tree mTLS feature. At that point the
candidate is Cilium with the existing policies migrated; this ADR will
be superseded.
