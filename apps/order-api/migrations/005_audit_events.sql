/* This migration prepares 005 audit events database changes for CloudOps. */
-- Backlog #73 — durable audit trail for order-api state changes.
--
-- Why: application logs are not enough for compliance investigations.
-- Logs roll over, get sampled, and live outside the database. An audit
-- table is queryable, durable, tenant-scoped, and (where practical)
-- written transactionally with the business change.
--
-- Scope today: POST /order success + failure events. Auth failures and
-- validation failures are intentionally NOT audited at the database
-- layer — they happen before the tenant context is set, and writing them
-- here would require a separate connection/role per the RLS policy.
-- The application logs already capture them.

CREATE TABLE IF NOT EXISTS audit_events (
  id          BIGSERIAL    PRIMARY KEY,
  tenant_id   VARCHAR(64)  NOT NULL,
  actor_id    VARCHAR(255),                -- JWT `sub` or API-key tag; NULL on the API-key path when no client identity is available
  action      VARCHAR(64)  NOT NULL,       -- e.g. 'order.create', 'order.create.failed'
  request_id  VARCHAR(64),                 -- correlates with the inbound request (X-Request-Id when present)
  resource_id VARCHAR(64),                 -- order_id when the event resolves to an order
  status_code SMALLINT     NOT NULL,
  result      VARCHAR(16)  NOT NULL CHECK (result IN ('success', 'failure')),
  error_code  VARCHAR(64),
  metadata    JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/* Alters the table named audit events. */
ALTER TABLE audit_events
  /* Drops the database object named constraint. */
  DROP CONSTRAINT IF EXISTS audit_events_tenant_id_format;

/* Alters the table named audit events. */
ALTER TABLE audit_events
  ADD CONSTRAINT audit_events_tenant_id_format
  CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,64}$');

-- Common query patterns: per-tenant timeline, per-action recent activity,
-- per-resource (order) lookup.
CREATE INDEX IF NOT EXISTS audit_events_tenant_created_idx
  ON audit_events (tenant_id, created_at DESC);
/* Creates the index named audit events action created idx. */
CREATE INDEX IF NOT EXISTS audit_events_action_created_idx
  ON audit_events (action, created_at DESC);
/* Creates the index named audit events resource idx. */
CREATE INDEX IF NOT EXISTS audit_events_resource_idx
  ON audit_events (resource_id) WHERE resource_id IS NOT NULL;

-- RLS: same model as orders / order_idempotency_keys (#51).
GRANT SELECT, INSERT ON audit_events TO order_api_app;
/* Grants the database object named usage. */
GRANT USAGE, SELECT ON SEQUENCE audit_events_id_seq TO order_api_app;

/* Alters the table named audit events. */
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
/* Alters the table named audit events. */
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

/* Drops the policy named tenant isolation. */
DROP POLICY IF EXISTS tenant_isolation ON audit_events;
/* Creates the policy named tenant isolation. */
CREATE POLICY tenant_isolation ON audit_events
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
