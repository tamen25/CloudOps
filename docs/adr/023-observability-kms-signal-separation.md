# ADR 023 — Observability KMS keys: separate CMK per signal

**Status:** Accepted
**Date:** 2026-05-14
**Closes:** backlog #110

## Context

`modules/observability/kms.tf` creates three Customer-Managed KMS keys when
`buckets_kms_cmk = true`:

| Key | S3 bucket | Signal |
|-----|-----------|--------|
| `aws_kms_key.loki`  | logs bucket   | logs   |
| `aws_kms_key.tempo` | traces bucket | traces |
| `aws_kms_key.mimir` | metrics bucket| metrics (TSDB blocks) |

Backlog #110 flagged the per-signal split as inconsistent with the rest of
the platform, where most modules use one CMK (`modules/storage`,
`modules/eks` post-#111, etc.).

Two options were considered:

1. Collapse the three observability CMKs into a single `observability` CMK.
2. Keep the per-signal split and document why.

## Decision

**Keep the per-signal split.**

## Rationale

1. **Blast-radius scoping.** A leaked key or accidental policy expansion
   only exposes one signal's data, not all observability evidence. Logs
   often contain the most sensitive payloads (PII, request bodies, error
   traces with credentials); compromising the logs key should not also
   expose the traces or metrics buckets.

2. **Independent rotation cadence.** Each CMK has `enable_key_rotation =
   true` (annual AWS-managed rotation). If we ever need to force an
   out-of-cycle rotation for one signal — e.g. a leaked Loki S3 read
   credential — we can `replace` that key without touching Tempo or
   Mimir backends.

3. **Per-bucket policies stay simple.** Each S3 bucket policy already
   references its own CMK ARN. A single shared CMK would require either
   broader `kms:Decrypt` grants (looser) or a more complex policy with
   `kms:EncryptionContext` constraints per bucket (more failure modes).

4. **Audit clarity.** CloudTrail `kms:Decrypt` events are filterable by
   key ARN. Per-signal keys make it trivial to ask "who decrypted log
   data in the last 24h?" without parsing encryption context.

5. **Cost is negligible.** Three CMKs cost $3/month total ($1/key) plus
   per-API-call charges. Observability workloads are not KMS-API-heavy
   compared to the existing data plane.

## Rejected: single observability CMK

Pros: one fewer key to track, marginally simpler IAM.
Cons:
- Cross-signal blast radius on key compromise.
- Coupled rotation — replacing the key forces re-encryption of all three
  buckets in lockstep.
- Loki's logs blast radius leaks onto metrics + traces audit boundaries.

Cost savings (~$2/month) do not justify the audit/blast-radius tradeoff.

## Consequences

- `modules/observability/kms.tf` stays at three CMKs.
- New observability signals (e.g. profiling via Pyroscope, if added) get
  their own CMK following the same pattern.
- The header comment in `kms.tf` already documents the
  "one CMK per signal type" rule; this ADR is the durable reference.

## Notes for future maintainers

The unrelated `modules/eks` CMK (#111) is a separate boundary — it
encrypts Kubernetes Secrets at rest, not S3 storage — and intentionally
does not share keys with observability buckets.
