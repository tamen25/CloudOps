/* This migration prepares 001 initial database changes for CloudOps. */
/* Initial schema for order-api.
   Applied by src/migrations.ts on startup via the `schema_migrations` tracking table. */

CREATE TABLE IF NOT EXISTS orders (
  id          SERIAL         PRIMARY KEY,
  order_id    VARCHAR(64)    UNIQUE NOT NULL,
  items       JSONB          NOT NULL DEFAULT '[]',
  total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
  environment VARCHAR(32),
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

/* Creates the index named orders created at idx. */
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);
