import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'crypto';
import http from 'http';
import { createApp } from '../src/app';

interface MockClient {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>;
  release: () => void;
}

function makePool(handlers: Array<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> | null>) {
  let calls = 0;
  const client: MockClient = {
    query: async (sql: string, params?: unknown[]) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes("set_config('app.tenant_id'")) return { rows: [] };
      while (calls < handlers.length) {
        const handler = handlers[calls];
        const result = await handler(sql, params);
        if (result !== null) {
          calls += 1;
          return result;
        }
        calls += 1;
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return {
    connect: async () => client,
    query: async (sql: string) => {
      if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
      return { rows: [] };
    },
  };
}

function hmacFor(opts: { secret: string; timestamp: string; tenant: string; body: string }) {
  return createHmac('sha256', opts.secret).update(`${opts.timestamp}.${opts.tenant}.${opts.body}`).digest('hex');
}

async function request(app: any, method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: any }>((resolve, reject) => {
    const server = app.listen(0, () => {
      const port = (server.address() as { port: number }).port;
      const data = body !== undefined ? JSON.stringify(body) : undefined;
      const req = http.request(
        {
          method,
          host: '127.0.0.1',
          port,
          path,
          headers: {
            'content-type': 'application/json',
            ...(data ? { 'content-length': Buffer.byteLength(data).toString() } : {}),
            ...headers,
          },
        },
        (res: any) => {
          let buf = '';
          res.on('data', (chunk: any) => (buf += chunk));
          res.on('end', () => {
            server.close();
            try {
              resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
            } catch {
              resolve({ status: res.statusCode, body: buf });
            }
          });
        }
      );
      req.on('error', (err: Error) => {
        server.close();
        reject(err);
      });
      if (data) req.write(data);
      req.end();
    });
  });
}

test('GET /products returns paginated list scoped to tenant', async () => {
  const sample = [
    { id: 1, sku: 'WIDGET-001', name: 'Cloud Widget', description: null, price_cents: 2998, qty: 10, image_key: null, created_at: '2026-05-10' },
  ];
  const pool = makePool([
    async (sql) => {
      assert.match(sql, /FROM products/);
      assert.match(sql, /is_active = true/);
      return { rows: sample };
    },
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'GET', '/products?limit=20', undefined, { 'x-tenant-id': 'acme' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.products, sample);
  assert.equal(res.body.limit, 20);
});

test('GET /products/:id 404 when product missing in tenant', async () => {
  const pool = makePool([async () => ({ rows: [] })]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'GET', '/products/42', undefined, { 'x-tenant-id': 'acme' });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'not_found');
});

test('GET /products/:id rejects invalid id', async () => {
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'GET', '/products/abc', undefined, { 'x-tenant-id': 'acme' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_id');
});

test('POST /_internal/search rejects missing HMAC', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'hmac_missing');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/search accepts valid HMAC and runs FTS', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const sample = [{ id: 1, sku: 'WIDGET-001', name: 'Cloud Widget', price_cents: 2998, qty: 10, image_key: null, rank: 0.42 }];
  const pool = makePool([
    async (sql, params) => {
      assert.match(sql, /plainto_tsquery/);
      assert.match(sql, /search_tsv @@ q/);
      assert.equal(params?.[0], 'widget');
      return { rows: sample };
    },
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget', limit: 20 });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget', limit: 20 }, {
    'x-cloudops-hmac': hmac,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.deepEqual(res.body.results, sample);
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/search 503 when HMAC secret not configured', async () => {
  const previous = process.env.INTERNAL_HMAC_SECRET;
  delete process.env.INTERNAL_HMAC_SECRET;
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' });
  assert.equal(res.status, 503);
  assert.equal(res.body.error, 'internal_hmac_not_configured');
  if (previous) process.env.INTERNAL_HMAC_SECRET = previous;
});

test('POST /_internal/admin/products creates product with valid HMAC', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([
    async (sql) => {
      assert.match(sql, /INSERT INTO products/);
      return { rows: [{ id: 99 }] };
    },
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ sku: 'NEW-1', name: 'New', price_cents: 1000 });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/admin/products', { sku: 'NEW-1', name: 'New', price_cents: 1000 }, {
    'x-cloudops-hmac': hmac,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.id, 99);
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('GET /products returns 500 when DB throws', async () => {
  const pool = makePool([async () => { throw new Error('boom'); }]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'GET', '/products', undefined, { 'x-tenant-id': 'acme' });
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'Failed to list products');
});

test('GET /products/:id returns 500 when DB throws', async () => {
  const pool = makePool([async () => { throw new Error('boom'); }]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const res = await request(app, 'GET', '/products/7', undefined, { 'x-tenant-id': 'acme' });
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'Failed to fetch product');
});

test('POST /_internal/search rejects empty query', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: '' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: '' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_query');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/search returns 500 on DB error', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([async () => { throw new Error('boom'); }]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 500);
  assert.equal(res.body.error, 'search_failed');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/search rejects stale timestamp', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const timestamp = String(Date.now() - 10 * 60 * 1000);
  const body = JSON.stringify({ q: 'widget' });
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'hmac_stale');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/admin/products validates required fields', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ sku: 'A', name: '' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/admin/products', { sku: 'A', name: '' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'invalid_product');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('PUT /_internal/admin/products/:id updates product', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([
    async (sql) => {
      assert.match(sql, /UPDATE products/);
      return { rows: [{ id: 5 }] };
    },
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ name: 'Renamed' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'PUT', '/_internal/admin/products/5', { name: 'Renamed' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 5);
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('PUT /_internal/admin/products/:id 404 when missing', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([async () => ({ rows: [] })]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ name: 'X' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'PUT', '/_internal/admin/products/99', { name: 'X' }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'not_found');
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('DELETE /_internal/admin/products/:id removes product', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([
    async (sql) => {
      assert.match(sql, /DELETE FROM products/);
      return { rows: [{ id: 5 }] };
    },
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({});
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'DELETE', '/_internal/admin/products/5', {}, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 5);
  delete process.env.INTERNAL_HMAC_SECRET;
});

test('POST /_internal/admin/products rejects malformed tenant header', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ sku: 'NEW-1', name: 'New', price_cents: 1000 });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'test-secret', timestamp, tenant: 'bad tenant', body });
  const res = await request(app, 'POST', '/_internal/admin/products', { sku: 'NEW-1', name: 'New', price_cents: 1000 }, {
    'x-cloudops-hmac': hmac, 'x-cloudops-timestamp': timestamp, 'x-cloudops-tenant': 'bad tenant',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'invalid_tenant');
  delete process.env.INTERNAL_HMAC_SECRET;
});

// #96 — dual-accept rotation tests
test('POST /_internal/search accepts HMAC signed with PREVIOUS secret during rotation', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'new-secret';
  process.env.INTERNAL_HMAC_SECRET_PREVIOUS = 'old-secret';
  const pool = makePool([
    async () => ({ rows: [] }),
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget', limit: 20 });
  const timestamp = String(Date.now());
  // Caller still uses the old secret (hasn't rolled yet)
  const hmac = hmacFor({ secret: 'old-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget', limit: 20 }, {
    'x-cloudops-hmac': hmac,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 200);
  delete process.env.INTERNAL_HMAC_SECRET;
  delete process.env.INTERNAL_HMAC_SECRET_PREVIOUS;
});

test('POST /_internal/search rejects HMAC signed with a stale unrelated secret', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'new-secret';
  process.env.INTERNAL_HMAC_SECRET_PREVIOUS = 'old-secret';
  const pool = makePool([]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'unrelated-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' }, {
    'x-cloudops-hmac': hmac,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'hmac_invalid');
  delete process.env.INTERNAL_HMAC_SECRET;
  delete process.env.INTERNAL_HMAC_SECRET_PREVIOUS;
});

test('POST /_internal/search accepts new secret when previous is unset', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'new-secret';
  // PREVIOUS not set — rotation complete state
  const pool = makePool([
    async () => ({ rows: [] }),
  ]);
  const { app } = createApp({ pool: pool as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget' });
  const timestamp = String(Date.now());
  const hmac = hmacFor({ secret: 'new-secret', timestamp, tenant: 'acme', body });
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget' }, {
    'x-cloudops-hmac': hmac,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 200);
  delete process.env.INTERNAL_HMAC_SECRET;
});

// S09: the signature was sha256(ts.tenant.body.secret), a secret-suffix hash.
// It is HMAC-SHA256 now, and the old form is refused.
test('POST /_internal/search refuses the old secret-suffix signature', async () => {
  process.env.INTERNAL_HMAC_SECRET = 'test-secret';
  const { app } = createApp({ pool: makePool([]) as any, nodeEnv: 'dev' });
  const body = JSON.stringify({ q: 'widget', limit: 20 });
  const timestamp = String(Date.now());
  const legacy = createHash('sha256').update(`${timestamp}.acme.${body}.test-secret`).digest('hex');
  const res = await request(app, 'POST', '/_internal/search', { q: 'widget', limit: 20 }, {
    'x-cloudops-hmac': legacy,
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': 'acme',
  });
  assert.equal(res.status, 401);
  delete process.env.INTERNAL_HMAC_SECRET;
});
