# ADR 004 — S3 as Loki and Tempo Backend Storage

**Status:** Accepted
**Date:** 2025-08-01
**Author:** Tamen Dutta

---

## Context

Loki (log storage) and Tempo (trace storage) are both chunk-based storage systems. They need a durable object store for their data backends. The two practical options on AWS are:

1. **EBS-backed PersistentVolumes** — each Loki or Tempo pod gets a PVC backed by an EBS gp3 volume. Simple to configure, local to the pod, high IOPS for hot data.
2. **S3** — an external object store that all replicas share. Loki supports S3 via the `filesystem` (local) or `s3` storage backend. Tempo supports S3 natively.

EBS PVCs are the default for stateful workloads on Kubernetes. However, they carry hidden costs and operational risks that become significant for observability data, which is write-heavy and read-rarely.

## Decision

We use S3 (`cloudops-loki-chunks-<account_id>` and `cloudops-tempo-traces-<account_id>`) as the storage backend for both Loki and Tempo, with a Glacier transition lifecycle policy at 30 days.

**Cost.** EBS gp3 storage costs ~$0.08/GB-month. S3 Standard costs ~$0.023/GB-month — roughly 3x cheaper. For observability data that is written continuously and read only during incidents (typically within the last 24 hours), S3 Standard is already overprovisioned. After 30 days, data transitions to S3 Glacier (~$0.004/GB-month), making long-term retention essentially free. A Loki installation storing 30 days of active logs and 6 months of Glacier archive costs dramatically less than an equivalent EBS footprint.

**No backup needed.** EBS volumes require snapshots for durability. S3 is inherently durable (11 nines). With S3 as the backend, there is no separate backup job to configure, no snapshot rotation policy, no cross-AZ replication to manage. The S3 buckets have `block_public_acls=true`, `block_public_policy=true`, and AES256 server-side encryption configured in `modules/observability/s3.tf`.

**Horizontal scaling.** EBS PVCs are attached to exactly one node at a time. If you run two Loki ingesters for HA, each needs its own PVC — and if you scale to three, you add a third PVC. With S3, all Loki ingesters share the same bucket. Scaling Loki out does not require provisioning new storage; S3 scales transparently.

**Stateless pods.** S3-backed Loki and Tempo pods are effectively stateless from the perspective of Kubernetes scheduling. They can be evicted and rescheduled on any node without a volume reattachment event (which on EBS can take 30-90 seconds). This is meaningful for self-healing scenarios where nodes are being cordoned and drained.

The trade-off we accepted: S3 is higher latency than local EBS for reads. Loki mitigates this with an in-memory chunk cache. For the access pattern of an observability store — high write throughput, infrequent ad-hoc reads — this trade-off is favorable. We are not running a low-latency OLTP database here.

The `force_destroy = true` flag on both buckets is intentional: in a dev environment, `terraform destroy` should clean up everything without requiring manual emptying of S3 buckets. This would be set to `false` in a production environment with deletion protection.

## Consequences

**Positive:**
- Storage cost ~3x lower than EBS for active data, ~20x lower after Glacier transition
- No snapshot or backup configuration required — S3 durability covers it
- Loki and Tempo pods are stateless from Kubernetes' perspective: faster scheduling, no volume reattachment delays
- Horizontal scaling of Loki ingesters does not require new PVC provisioning
- Both buckets are audited by the compliance scanner Lambda in `modules/security/compliance_scanner.tf`

**Negative:**
- S3 API latency (~10-30ms) is higher than local EBS (~0.5-1ms). Loki's chunk cache absorbs most of this for recent data, but cold reads of old data are slower
- IAM permissions for Loki and Tempo to access S3 must be managed via IRSA — one more IAM role to maintain. This is captured in `modules/observability/iam.tf`
- `force_destroy=true` means a `terraform destroy` will permanently delete all historical logs and traces — intentional in dev, dangerous in prod
- Eventual consistency of S3 listing operations (fixed in S3's strong consistency model since 2020, but worth noting for anyone familiar with the old model)
