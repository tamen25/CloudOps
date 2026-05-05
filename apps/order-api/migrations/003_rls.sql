-- Backlog #51 — DB-level tenant isolation via Row Level Security.
--
-- App-side filtering (#8) is necessary but not sufficient: a missing WHERE
-- tenant_id clause anywhere — a future query, an analytics tool, an
-- emergency hotfix — leaks every tenant's data. RLS makes the filter
-- impossible to forget.
--
-- Strategy: enable + FORCE row level security on orders, then add a single
-- policy that requires the session's `app.tenant_id` setting to match the
-- row's tenant_id for both reads (USING) and writes (WITH CHECK). The app
-- sets this via `SET LOCAL app.tenant_id = $1` inside a transaction
-- wrapping every query. FORCE ensures even the table owner (the RDS master
-- user used in dev) cannot bypass — superuser is the only escape, and the
-- master user is not a Postgres superuser on RDS.

-- The runtime app role is created lazily — production wires a separate
-- credential via Secrets Manager (#37 ARN scoping); dev keeps using the
-- master credential. Either way, FORCE RLS makes both paths equivalent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'order_api_app') THEN
    CREATE ROLE order_api_app NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO order_api_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON orders TO order_api_app;

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
