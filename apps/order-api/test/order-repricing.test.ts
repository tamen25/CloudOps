// Re-pricing guard for POST /order — closes the 2026-05-15 security review
// finding (price-tampering via client-supplied total). The order-api must
// re-fetch product.price_cents inside the tenant tx and reject if the
// caller's total does not match the recomputed sum.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';

function silentLogger() { return { info() {}, warn() {}, error() {} }; }

function makePool(prices: Record<string, number>) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (/^BEGIN$|^COMMIT$|^ROLLBACK$/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/set_config/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && (params[0] as string[])) || [];
        const rows = skus
          .filter((sku) => prices[sku] !== undefined)
          .map((sku) => ({ sku, price_cents: prices[sku] }));
        return { rows, rowCount: rows.length };
      }
      if (/^INSERT INTO orders/i.test(sql)) {
        return { rows: [{ order_id: 'ok', tenant_id: (params as unknown[])![4], owner_sub: (params as unknown[])![5] }], rowCount: 1 };
      }
      if (/^INSERT INTO audit_events/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
}

async function startApp(prices: Record<string, number>) {
  const pool = makePool(prices);
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared',
    rateLimitMax: 1000,
  });
  return new Promise<{ server: any; baseUrl: string }>((resolve) => {
    const server = (app as any).listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const baseHeaders = {
  'Content-Type': 'application/json',
  'X-Api-Key': 'shared',
  'X-Tenant-Id': 'acme',
};

test('POST /order accepts a total that matches the catalog price', async () => {
  const { server, baseUrl } = await startApp({ 'book-1': 1999 });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 2 }], total: 39.98 }),
    });
    assert.equal(r.status, 201);
  } finally {
    server.close();
  }
});

test('POST /order rejects with 422 invalid_total when caller submits a lower total', async () => {
  const { server, baseUrl } = await startApp({ 'book-1': 1999 });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 0.01 }),
    });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(body.error, 'invalid_total');
    assert.match(body.detail, /19\.99/);
  } finally {
    server.close();
  }
});

test('POST /order rejects with 422 invalid_total when caller submits a higher total', async () => {
  const { server, baseUrl } = await startApp({ 'book-1': 1999 });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 99.99 }),
    });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(body.error, 'invalid_total');
  } finally {
    server.close();
  }
});

test('POST /order rejects with 422 unknown_sku when the SKU is not in the catalog', async () => {
  const { server, baseUrl } = await startApp({ 'book-1': 1999 });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({ items: [{ sku: 'GHOST', quantity: 1 }], total: 19.99 }),
    });
    assert.equal(r.status, 422);
    const body = await r.json();
    assert.equal(body.error, 'unknown_sku');
    assert.match(body.detail, /GHOST/);
  } finally {
    server.close();
  }
});

test('POST /order recomputes total across multiple items', async () => {
  const { server, baseUrl } = await startApp({ 'book-1': 1999, 'mug-1': 1250 });
  try {
    //2 books @ $19.99 + 1 mug @ $12.50 = $52.48
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders,
      body: JSON.stringify({
        items: [
          { sku: 'book-1', quantity: 2 },
          { sku: 'mug-1', quantity: 1 },
        ],
        total: 52.48,
      }),
    });
    assert.equal(r.status, 201);
  } finally {
    server.close();
  }
});
