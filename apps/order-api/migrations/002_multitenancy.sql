/* This migration prepares 002 multitenancy database changes for CloudOps. */
/* Multi-tenant data model — closes backlog #8.

   Adds `tenant_id` to orders, backfills existing rows with `default`, then
   enforces NOT NULL. After this migration:
     - Every INSERT must provide tenant_id (app-side enforced).
     - Every SELECT must filter by tenant_id (app-side enforced).
     - The (tenant_id, created_at) composite index supports the GET /orders
       "latest 100 for this tenant" query without sequential scans.

   RLS (row-level security) is deferred. RDS's master user owns the table
   and bypasses RLS by default; activating RLS safely requires a separate
   app role that the connection pool uses. Documented in the open backlog. */

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(64) NOT NULL DEFAULT 'default';

/* The DEFAULT above backfilled existing rows. Drop the default so future
   INSERTs must specify tenant_id explicitly. */
ALTER TABLE orders ALTER COLUMN tenant_id DROP DEFAULT;

/* Composite index for the per-tenant listing query. */
CREATE INDEX IF NOT EXISTS orders_tenant_created_idx
  ON orders (tenant_id, created_at DESC);

/* Sanity constraint — tenant_id must be 1–64 chars of [a-zA-Z0-9_-].
   Catches accidental empty strings and prevents header smuggling. */
ALTER TABLE orders
  /* Drops the database object named constraint. */
  DROP CONSTRAINT IF EXISTS orders_tenant_id_format;

/* Alters the table named orders. */
ALTER TABLE orders
  ADD CONSTRAINT orders_tenant_id_format
  CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,64}$');
