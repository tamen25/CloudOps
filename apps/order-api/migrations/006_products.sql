/* Migration 006 — products table with Postgres FTS + RLS.
 * Backlog #81. Tenant-scoped catalog table feeds:
 *  - /products + /products/:id (public-read, tenant-scoped) in this story
 *  - /_internal/search FTS endpoint consumed by the search-gateway Lambda (#82)
 *  - /_internal/admin/products CRUD (HMAC-gated) for admin UI (#88)
 *
 * Defence-in-depth identical to orders (#51): FORCE RLS so the table
 * owner (RDS master in dev) cannot bypass — only Postgres superusers can,
 * and the RDS master is not a superuser. App sets `app.tenant_id` via
 * withTenant() before every query.
 */

CREATE TABLE IF NOT EXISTS products (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    VARCHAR(64) NOT NULL,
  sku          VARCHAR(64) NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  price_cents  BIGINT NOT NULL CHECK (price_cents >= 0),
  qty          INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  image_key    TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  search_tsv   tsvector GENERATED ALWAYS AS (
                 to_tsvector(
                   'english',
                   coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(sku, '')
                 )
               ) STORED,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_tenant_id_format CHECK (tenant_id ~ '^[a-zA-Z0-9_-]{1,64}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_sku_uniq
  ON products (tenant_id, sku);

CREATE INDEX IF NOT EXISTS products_tenant_active_created_idx
  ON products (tenant_id, is_active, created_at DESC);

CREATE INDEX IF NOT EXISTS products_search_tsv_idx
  ON products USING GIN (search_tsv);

GRANT SELECT, INSERT, UPDATE, DELETE ON products TO order_api_app;
GRANT USAGE, SELECT ON SEQUENCE products_id_seq TO order_api_app;

ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_products ON products;
CREATE POLICY tenant_isolation_products ON products
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
