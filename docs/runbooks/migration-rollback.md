# Migration rollback runbook

Closes backlog #125.

This repo does NOT maintain a `migrations/rollback/` directory. The
philosophy is: forward-only migrations with carefully scoped changes per
file. This runbook documents how to recover when a migration goes wrong,
and what guardrails make that recoverable.

## Why forward-only

- Reversible migrations double the test surface (forward + back, both
  must keep data intact). Single-direction migrations stay simple.
- Most "rollbacks" in practice are forward migrations that undo or
  amend a prior change.
- The migration runner (`apps/order-api/src/migrations.ts`) tracks
  applied filenames in `schema_migrations` and refuses to re-run; there
  is no "down" hook to invoke.
- Postgres advisory locks (`withAdvisoryLock`) prevent concurrent
  migration runs from a rolling deploy.

## Guardrails already in place

1. **Per-migration transaction.** Each file runs inside `BEGIN ... COMMIT`.
   A DDL or DML failure inside one file rolls back that file's changes
   only; the `schema_migrations` row is not written, so the next deploy
   retries the same file.
2. **Advisory lock.** Two replicas cannot apply at once.
3. **`activeDeadlineSeconds: 600`** on the migration Job
   (`apps/order-api/k8s/migration-job.yaml`, #117) — a hung migration
   fails the rollout instead of holding the lock forever.
4. **Backup before destructive change.** RDS automated daily snapshots
   plus the master snapshot taken by `app.yml`'s pre-migration step in
   staging/prod give a 5-minute recovery point.

## When a migration fails partway

### Case A — failure inside the migration's own transaction

Symptom: Job exits non-zero; `schema_migrations` does NOT contain the
file's name; ROLLBACK was issued.

Action: fix the SQL, ship a new image, redeploy. The runner will retry
the same file. No manual DB intervention needed.

### Case B — failure AFTER the migration's transaction committed

Symptom: file's row is in `schema_migrations`, but the schema is in a
state that breaks the application (e.g. NOT NULL constraint added but
app code still writes NULLs).

Action: write a NEW migration file that undoes or amends the change.
Examples:

- `008_drop_orders_currency.sql` — to undo `007_add_orders_currency.sql`
  if the column turned out to be wrong.
- `009_relax_orders_status_check.sql` — to loosen a CHECK constraint
  that turned out to be over-restrictive.

Do NOT delete the offending file from `migrations/`. Other deployed
instances already have the row in `schema_migrations` and the file
needs to keep existing on disk for the tracking table to make sense.

### Case C — data corruption

Symptom: migration logic was correct but operated on the wrong rows
(e.g. tenant boundary mistake) and committed.

Action: restore from RDS snapshot.

1. Confirm latest automated snapshot timestamp:
   `aws rds describe-db-cluster-snapshots --db-cluster-identifier <id>
    --snapshot-type automated --query 'reverse(sort_by(DBClusterSnapshots, &SnapshotCreateTime))[:5]'`
2. Restore to a new cluster:
   `aws rds restore-db-cluster-from-snapshot --db-cluster-identifier
    <id>-restore --snapshot-identifier <snapshot-arn>`
3. Re-point the application via Secrets Manager rotation (or update
   the connection target). Capture the timing in `audit_events` for
   the postmortem.
4. Take a fresh snapshot before redirecting traffic, so the broken
   state is preserved for forensics.

## Pre-flight for risky migrations

When a migration is more than additive (e.g. drops a column, narrows a
type, renames a table), do this BEFORE merging the PR:

- [ ] Snapshot the cluster: `aws rds create-db-cluster-snapshot ...`
- [ ] Run the migration against a restored clone in dev/staging first.
- [ ] Document the forward-recovery migration that would amend or
      undo the change, so you don't write it under pressure.
- [ ] Confirm the application can run against BOTH the old and the new
      schema for at least one deploy window (zero-downtime contract).

## What we explicitly do NOT do

- We do not commit `down.sql` files. They drift from the corresponding
  `up.sql` and create false confidence.
- We do not let the runner re-run a file by manually deleting its
  `schema_migrations` row. The runner expects monotonic forward state.
- We do not allow ad-hoc DDL in prod outside this migration pipeline.
  Drift surfaces in `terraform plan` via the database module, and in
  schema-diff jobs (future #16 follow-up).
