/* Migration 008 — the deploy pipeline's integration-test product.
 * app.yml's integration-test job places an order as tenant
 * `integration-test` for SKU `it-widget` at 9.99. Orders are re-priced
 * against products, so without this row every fresh database refuses the
 * test order with unknown_sku and the pipeline can never pass.
 *
 * The tenant is synthetic and isolated by RLS like any other: the row is
 * visible to that tenant only and grants nothing outside it. FORCE RLS
 * applies to the migration's role too (the RDS master is not a superuser),
 * so the insert sets app.tenant_id for this transaction first.
 */

SELECT set_config('app.tenant_id', 'integration-test', true);

INSERT INTO products (tenant_id, sku, name, description, price_cents, qty, is_active)
VALUES (
  'integration-test',
  'it-widget',
  'Integration test widget',
  'Fixture for the deploy pipeline''s integration tests.',
  999,
  1000000,
  true
)
ON CONFLICT (tenant_id, sku) DO NOTHING;
