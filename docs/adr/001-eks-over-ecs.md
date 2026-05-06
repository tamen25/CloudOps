# ADR 001 — EKS over ECS Fargate

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

CloudOps needed a container orchestration platform for the order-api workload. The two credible AWS-native options were Amazon EKS (managed Kubernetes) and Amazon ECS Fargate (serverless containers). Both abstract node management, but they have sharply different extension surfaces.

The observability stack we planned — Grafana, Loki, Tempo, Prometheus — is distributed as Helm charts maintained by Grafana Labs and the CNCF ecosystem. The security tooling we planned — Falco for runtime threat detection, OPA Gatekeeper for admission control, kube-bench for CIS benchmarking — is Kubernetes-native: Falco runs as a DaemonSet using eBPF, Gatekeeper runs as a ValidatingAdmissionWebhook, kube-bench is a CronJob. None of these have idiomatic ECS equivalents.

ECS Fargate is purpose-built for "run a container, don't think about nodes." It is genuinely simpler if your requirements fit inside that constraint. The question was whether ours did.

## Decision

We chose EKS with managed node groups (Amazon Linux 2, t3.large instances).

The specific capabilities that made EKS the only viable option for this stack:

**DaemonSets.** Falco must run on every node to intercept syscalls via eBPF. ECS has no DaemonSet equivalent — you would have to run Falco outside ECS entirely (e.g., on the underlying EC2 instances directly), which defeats the point of a managed service and requires reimplementing node lifecycle management.

**Admission webhooks.** OPA Gatekeeper registers as a `ValidatingAdmissionWebhook` against the Kubernetes API server. This is a Kubernetes control plane extension point. There is no equivalent in ECS — policy enforcement would have to happen in CI or as a sidecar pattern, which catches misconfigurations later in the pipeline rather than at admission time.

**HPA + custom metrics.** The self-healing module relies on Kubernetes Horizontal Pod Autoscaler (`HPA`) to drive scale-out healing actions. HPA is a first-class Kubernetes primitive; the self-healing Lambda PATCHes `spec.minReplicas` directly to restore minimum pod counts. ECS Application Auto Scaling exists but is a completely different API surface, requiring different Lambda logic and losing the ecosystem of HPA-aware tooling.

**Helm charts.** The entire LGTM observability stack (Loki, Grafana, Tempo, Prometheus via kube-prometheus-stack, OTel Collector, Falco) ships as Helm charts with well-maintained default values. Using these charts on ECS would require porting them to ECS task definitions — a large, ongoing maintenance burden with no community equivalents.

**Career alignment.** Kubernetes is the de facto standard for container orchestration in production environments. ECS expertise has narrower transferability. This matters for a project intended to demonstrate SRE competency on a resume.

The tradeoff accepted: EKS is operationally heavier than ECS Fargate. Node group upgrades, add-on version management, OIDC provider setup, and IRSA configuration don't exist in ECS. We mitigate this by using managed node groups (AWS handles node patching), EKS-managed add-ons (vpc-cni, coredns, kube-proxy, ebs-csi-driver), and Terraform for all configuration.

## Consequences

**Positive:**
- Full Kubernetes ecosystem available: Helm, IRSA, HPA, DaemonSets, admission webhooks, CronJobs
- All observability and security tools install directly via `helm_release` Terraform resources
- Self-healing Lambda can interact with the cluster via standard Kubernetes API without any ECS-specific translation layer
- Portable: the same Helm charts and Kubernetes manifests could run on GKE or AKS with minimal changes

**Negative:**
- Higher baseline cost: t3.large nodes at ~$60/month each; minimum 2 for HA means ~$120/month before workloads
- EKS version upgrade cadence is faster than ECS (new minor versions every few months, 14-month support window per version)
- IRSA configuration requires the OIDC provider setup captured in `modules/eks/cluster.tf` and `modules/eks/irsa.tf` — this is additional Terraform surface that ECS doesn't require
