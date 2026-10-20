# ADR 008 — OSS Security Stack over AWS-Native Services

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

CloudOps needed runtime threat detection, admission control, and CIS benchmark compliance checking for the EKS cluster. The AWS-native security services are:

- **Amazon GuardDuty** — threat detection for EC2, S3, IAM, and EKS (via EKS audit log analysis)
- **AWS Security Hub** — aggregation and normalization of findings from GuardDuty, Inspector, Macie, Config
- **AWS Config** — configuration compliance rules for AWS resources

The OSS alternatives we evaluated:

- **Falco** (CNCF project) — eBPF-based runtime threat detection inside the kernel, per-container syscall visibility
- **OPA Gatekeeper** — admission webhook policy enforcement using Rego policies
- **kube-bench** — CIS Kubernetes Benchmark automated checks

## Decision

We use Falco + OPA Gatekeeper + kube-bench over GuardDuty + Security Hub + Config.

**Cost.** GuardDuty EKS Protection costs ~$0.50 per vCPU per cluster per month. For a 2-node t3.large cluster (4 vCPUs each = 8 vCPUs total), that's ~$4/month at the cluster level, but EKS audit log analysis is priced additionally at $0.57/million audit log events. For a production cluster under active use, this compounds quickly. Security Hub costs $0.0010 per finding ingested per month, plus $0.001 per Security Standard rule per account per region. Config charges per configuration item recorded and per rule evaluation.

For a project where cost visibility is itself an SRE concern (see ADR 010), adding variable-rate security services that bill per-event-processed conflicts with the project's design philosophy.

Falco, OPA Gatekeeper, and kube-bench are compute-only: they consume CPU and memory on the cluster, which we're already paying for, and produce no per-finding AWS charges.

**Kernel-level visibility.** GuardDuty EKS Protection analyzes EKS audit logs — API server-level events. It knows that a pod tried to create a ClusterRoleBinding; it doesn't know that a process inside a container opened `/etc/passwd` for reading or exfiltrated data via a raw socket. Falco with eBPF operates at the syscall level: it can detect `execve` of unexpected binaries, `openat` on sensitive paths, `socket` calls from containers that shouldn't make network connections, and privilege escalation attempts in real time.

The CloudOps Falco rules (`modules/security/falco_rules.tf`) detect: privileged containers outside the `kube-system` namespace, shell spawned inside `order-api` pods, unexpected file writes to `/etc/`, and network connections to unexpected external IPs. These detections are not possible at the audit log level.

**Kubernetes-native policy.** OPA Gatekeeper's ValidatingAdmissionWebhook intercepts every Pod `CREATE`/`UPDATE` request before it reaches etcd. Our Gatekeeper policies (`modules/security/gatekeeper_policies.tf`) reject: containers running as root, containers without resource limits, containers requesting `hostNetwork` or `hostPID`, images from registries outside `docker.io` and `public.ecr.aws`. These are checked at admission time — before the container ever starts.

AWS Config rules for EKS are IAM and networking-level checks. They don't evaluate pod specifications.

**Pipeline portability.** Since Falco findings flow through Falcosidekick → OTel Collector → Loki → Grafana (the same pipeline as application logs), security findings are queryable using the same Grafana log panel syntax as application logs. An engineer investigating an incident doesn't switch tools. If we move from AWS to GKE tomorrow, the entire security stack is portable — Falco, Gatekeeper, and kube-bench work on any CNCF-conformant Kubernetes cluster.

## Consequences

**Positive:**
- No per-event AWS billing for security findings
- Kernel-level syscall visibility (Falco/eBPF) vs. audit log level (GuardDuty) — detects a broader class of threats
- Admission control at pod creation time (Gatekeeper) vs. configuration compliance after the fact (Config)
- Security findings visible in the same Grafana/Loki pipeline as application logs — single pane of glass
- Portable across cloud providers and on-prem Kubernetes

**Negative:**
- Falco DaemonSet requires eBPF support on the node AMI. On Amazon Linux 2 with EKS-managed AMIs, this works out of the box. On custom AMIs or Bottlerocket, kernel version compatibility must be verified
- OPA Gatekeeper requires two-apply bootstrapping on a fresh cluster: first apply installs the CRDs, second apply creates the Constraint instances. This is documented in `modules/security/gatekeeper.tf` but is a friction point for automated deployments
- No managed finding deduplication or enrichment (Security Hub does this automatically). Our compliance scanner Lambda (`modules/security/compliance_scanner.tf`) implements custom deduplication via DynamoDB, but it's bespoke
- GuardDuty has managed threat intelligence feeds (IP reputation lists, domain blocklists) that Falco does not include by default. We would need to maintain custom Falco rules lists for these threat intel sources
