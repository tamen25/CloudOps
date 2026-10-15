/* Seed catalog with sample products for demo (closes backlog #81).
 *
 * Usage:
 *   DATABASE_URL=postgres://... TENANTS=acme,globex,initech \
 *     tsx apps/order-api/scripts/seed-products.ts
 *
 * 50 products evenly distributed across the configured tenants. Each
 * tenant gets unique SKUs so the FTS cross-tenant isolation test in
 * products.test.ts stays meaningful.
 */
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const tenants = (process.env.TENANTS ?? 'acme,globex,initech')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

if (tenants.length === 0) {
  console.error('TENANTS must list at least one tenant identifier.');
  process.exit(1);
}

const adjectives = ['Cloud', 'Bolt', 'Pixel', 'Quantum', 'Edge', 'Hyper', 'Nova', 'Vector', 'Atomic', 'Ember'];
const nouns = ['Widget', 'Hub', 'Lens', 'Forge', 'Switch', 'Beacon', 'Wedge', 'Engine', 'Pulse', 'Console'];

interface Product {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  qty: number;
}

function buildCatalog(): Product[] {
  const products: Product[] = [];
  for (let i = 0; i < 50; i += 1) {
    const adj = adjectives[i % adjectives.length];
    const noun = nouns[Math.floor(i / adjectives.length) % nouns.length];
    products.push({
      sku: `${adj.toUpperCase()}-${noun.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
      name: `${adj} ${noun}`,
      description: `${adj} ${noun} — premium grade hardware for the modern stack.`,
      priceCents: 999 + i * 311,
      qty: 5 + ((i * 7) % 90),
    });
  }
  return products;
}

async function main(): Promise<void> {
  const catalog = buildCatalog();
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    let inserted = 0;
    for (const tenant of tenants) {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
      for (const product of catalog) {
        await client.query(
          `INSERT INTO products (tenant_id, sku, name, description, price_cents, qty)
             VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (tenant_id, sku) DO UPDATE
             SET name = EXCLUDED.name,
                 description = EXCLUDED.description,
                 price_cents = EXCLUDED.price_cents,
                 qty = EXCLUDED.qty,
                 updated_at = NOW()`,
          [tenant, product.sku, product.name, product.description, product.priceCents, product.qty]
        );
        inserted += 1;
      }
      await client.query('COMMIT');
    }
    console.log(`Seeded ${inserted} rows across ${tenants.length} tenant(s).`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
