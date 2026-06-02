/* This migration prepares 004 idempotency keys database changes for CloudOps. */
/* Backlog #72 — tenant-scoped idempotency keys for POST /order.

   Why: clients retry on timeouts / connection resets / deploy interruptions.
   Without idempotency, a retry can create a duplicate order. With this table
   the server records the first response, then replays it for any retry that
   presents the same (tenant_id, idempotency_key) AND a matching payload hash.
   A reused key with a different payload yields 409 — the client is misusing
   the key and we refuse to silently overwrite.

   Concurrency: the (tenant_id, idempotency_key) PRIMARY KEY plus
   INSERT ... ON CONFLICT DO NOTHING is the writer's race fence. The losing
   writer falls back to SELECT ... FOR UPDATE which blocks until the winner
   commits the response, then either replays or 409s. */

CREATE TABLE IF NOT EXISTS order_idempotency_keys (
  tenant_id        VARCHAR(64)   NOT NULL,
  idempotency_key  VARCHAR(255)  NOT NULL,
  request_hash     VARCHAR(64)   NOT NULL,
  status_code      SMALLINT      NOT NULL,
  response_body    JSONB         NOT NULL,
  order_id         VARCHAR(64),
  expires_at       TIMESTAMPTZ   NOT NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, idempotency_key)
);

/* Tenant format mirrors orders.tenant_id (multitenancy migration 002). */
ALTER TABLE order_idempotency_keys
  /* Drops the database object named constraint. */
  DROP CONSTRAINT IF EXISTS order_idempotency_tenant_id_format;

/* Alters the table named order idempotency keys. */
ALTER TABLE order_idempotency_keys
  ADD CONSTRAINT order_idempotency_tenant_id_format
  CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,64}$');

/* Idempotency-Key header is opaque, but constrain to ASCII printable + a
   sane length so it can be safely indexed and logged. */
ALTER TABLE order_idempotency_keys
  /* Drops the database object named constraint. */
  DROP CONSTRAINT IF EXISTS order_idempotency_key_format;

/* Alters the table named order idempotency keys. */
ALTER TABLE order_idempotency_keys
  ADD CONSTRAINT order_idempotency_key_format
  CHECK (idempotency_key ~ '^[\x21-\x7e]{1,255}$');

/* Cleanup helper: a periodic DELETE WHERE expires_at < NOW() retires expired
   keys. Indexed for that scan pattern. */
CREATE INDEX IF NOT EXISTS order_idempotency_expires_at_idx
  ON order_idempotency_keys (expires_at);

/* Mirror the orders RLS contract (#51) — tenant isolation is enforced at the
   database layer, not just in app code. */
GRANT SELECT, INSERT, UPDATE, DELETE ON order_idempotency_keys TO order_api_app;

/* Alters the table named order idempotency keys. */
ALTER TABLE order_idempotency_keys ENABLE ROW LEVEL SECURITY;
/* Alters the table named order idempotency keys. */
ALTER TABLE order_idempotency_keys FORCE ROW LEVEL SECURITY;

/* Drops the policy named tenant isolation. */
DROP POLICY IF EXISTS tenant_isolation ON order_idempotency_keys;
/* Creates the policy named tenant isolation. */
CREATE POLICY tenant_isolation ON order_idempotency_keys
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
