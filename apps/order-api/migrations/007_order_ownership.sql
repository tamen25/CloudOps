/* Migration 007 — user-owned orders + principal-scoped idempotency.
 *
 * Tenant isolation prevents cross-tenant leakage, but end-user JWT routes
 * also need an intra-tenant ownership boundary. `owner_sub` stores the OIDC
 * subject for user-created orders; API-key/system-created rows remain NULL.
 *
 * Existing rows cannot be backfilled safely because older records did not
 * retain a user subject. They stay visible to trusted API-key callers, but
 * JWT callers only see rows that explicitly belong to their `sub`.
 */

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS owner_sub VARCHAR(255);

CREATE INDEX IF NOT EXISTS orders_tenant_owner_created_idx
  ON orders (tenant_id, owner_sub, created_at DESC);

DROP POLICY IF EXISTS tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND (
      NULLIF(current_setting('app.user_sub', true), '') IS NULL
      OR owner_sub = current_setting('app.user_sub', true)
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    AND (
      NULLIF(current_setting('app.user_sub', true), '') IS NULL
      OR owner_sub = current_setting('app.user_sub', true)
    )
  );

/* JWT callers must not share the same idempotency namespace merely because
 * they are in the same tenant; otherwise one user can replay another user's
 * stored response by colliding on Idempotency-Key.
 */
ALTER TABLE order_idempotency_keys
  ADD COLUMN IF NOT EXISTS subject_scope VARCHAR(255) NOT NULL DEFAULT '';

ALTER TABLE order_idempotency_keys
  DROP CONSTRAINT IF EXISTS order_idempotency_keys_pkey;

ALTER TABLE order_idempotency_keys
  ADD PRIMARY KEY (tenant_id, subject_scope, idempotency_key);

DROP POLICY IF EXISTS tenant_isolation ON order_idempotency_keys;
CREATE POLICY tenant_isolation ON order_idempotency_keys
  USING (
    tenant_id = current_setting('app.tenant_id', true)
    AND (
      NULLIF(current_setting('app.user_sub', true), '') IS NULL
      OR subject_scope = current_setting('app.user_sub', true)
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.tenant_id', true)
    AND (
      NULLIF(current_setting('app.user_sub', true), '') IS NULL
      OR subject_scope = current_setting('app.user_sub', true)
    )
  );
