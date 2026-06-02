// This file contains multitenancy test logic for order API test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';

// Handles silent logger.
function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

// Builds pool.
function makePool({ store }) {
  return {
    query: async (sql, params) => {
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && params[0]) || [];
        return { rows: skus.map((sku) => ({ sku, price_cents: 100 })), rowCount: skus.length };
      }
      if (/^INSERT INTO orders/i.test(sql)) {
        const [order_id, items, total, environment, tenant_id, owner_sub] = params;
        const row = { id: store.length + 1, order_id, items, total, environment, tenant_id, owner_sub };
        store.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (/^SELECT .* FROM orders WHERE tenant_id/i.test(sql)) {
        const [tenant_id, maybeOwner, maybeOrderId] = params;
        const rows = store.filter((r) =>
          r.tenant_id === tenant_id
          && (!sql.includes('owner_sub = $2') || r.owner_sub === maybeOwner)
          && (!sql.includes('order_id = $2') || r.order_id === maybeOwner)
          && (!sql.includes('order_id = $3') || r.order_id === maybeOrderId)
        );
        return { rows, rowCount: rows.length };
      }
      if (/^INSERT INTO audit_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

// Handles start app.
async function startApp({ store }) {
  const pool = makePool({ store });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared-secret',
    rateLimitMax: 1000,
  });
  return new Promise((r) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      r({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

const validBody = JSON.stringify({ items: [{ sku: 'a', quantity: 1 }], total: 1 });

test('tenant_id is persisted on POST /order from X-Tenant-Id header', async () => {
  const store = [];
  const { server, baseUrl } = await startApp({ store });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'shared-secret',
        'X-Tenant-Id': 'acme',
      },
      body: validBody,
    });
    assert.equal(r.status, 201);
    assert.equal(store.length, 1);
    assert.equal(store[0].tenant_id, 'acme');
  } finally {
    server.close();
  }
});

test('GET /orders only returns rows for the requesting tenant', async () => {
  const store = [
    { id: 1, order_id: 'a', items: '[]', total: 1, environment: 'test', tenant_id: 'acme' },
    { id: 2, order_id: 'b', items: '[]', total: 2, environment: 'test', tenant_id: 'acme' },
    { id: 3, order_id: 'c', items: '[]', total: 3, environment: 'test', tenant_id: 'globex' },
  ];

  const { server, baseUrl } = await startApp({ store });
  try {
    const r = await fetch(`${baseUrl}/orders`, {
      headers: { 'X-Api-Key': 'shared-secret', 'X-Tenant-Id': 'acme' },
    });
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.count, 2);
    for (const row of body.orders) assert.equal(row.tenant_id, 'acme');
  } finally {
    server.close();
  }
});

test('malformed X-Tenant-Id header is rejected with 400', async () => {
  const store = [];
  const { server, baseUrl } = await startApp({ store });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'shared-secret',
        'X-Tenant-Id': 'invalid tenant!',
      },
      body: validBody,
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, 'invalid_tenant');
  } finally {
    server.close();
  }
});

test('rate limit is per-tenant (closes backlog #45)', async () => {
  const store = [];
  // Tight limit: 2 reqs per tenant, very wide window.
  const pool = makePool({ store });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared-secret',
    rateLimitMax: 2,
    rateLimitWindowMs: 60_000,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    // Handles post.
    const post = async (tenant) => fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': 'shared-secret',
        'X-Tenant-Id': tenant,
      },
      body: validBody,
    });

    const a1 = await post('acme');
    const a2 = await post('acme');
    const a3 = await post('acme');
    assert.equal(a1.status, 201);
    assert.equal(a2.status, 201);
    assert.equal(a3.status, 429, 'third request from same tenant must be limited');

    // A different tenant sharing the same source IP should NOT be blocked
    // by tenant `acme`'s budget.
    const g1 = await post('globex');
    assert.equal(g1.status, 201, 'second tenant has its own bucket');
  } finally {
    server.close();
  }
});

test('JWT callers also receive independent per-user rate limits', async () => {
  const store = [];
  const pool = makePool({ store });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    jwtVerifier: (req, _res, next) => {
      req.user = { sub: req.get('x-user-sub'), tenant_id: 'acme' };
      next();
    },
    ipRateLimitMax: 1000,
    tenantRateLimitMax: 1000,
    userRateLimitMax: 1,
    rateLimitWindowMs: 60_000,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const post = async (user) => fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Sub': user,
      },
      body: validBody,
    });

    const a1 = await post('user-a');
    const a2 = await post('user-a');
    const b1 = await post('user-b');
    assert.equal(a1.status, 201);
    assert.equal(a2.status, 429, 'second request from the same user must be limited');
    assert.equal(b1.status, 201, 'another user in the same tenant has a separate bucket');
  } finally {
    server.close();
  }
});

test('dev/test fallback uses `default` tenant when no header is supplied', async () => {
  const store = [];
  const { server, baseUrl } = await startApp({ store });
  try {
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared-secret' },
      body: validBody,
    });
    assert.equal(r.status, 201);
    assert.equal(store[0].tenant_id, 'default');
  } finally {
    server.close();
  }
});

test('JWT callers only see their own orders inside the tenant', async () => {
  const store = [
    { id: 1, order_id: 'a', items: '[]', total: 1, environment: 'test', tenant_id: 'acme', owner_sub: 'user-a' },
    { id: 2, order_id: 'b', items: '[]', total: 2, environment: 'test', tenant_id: 'acme', owner_sub: 'user-b' },
  ];
  const pool = makePool({ store });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    jwtVerifier: (req, _res, next) => {
      req.user = { sub: 'user-a', tenant_id: 'acme' };
      next();
    },
    rateLimitMax: 1000,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const r = await fetch(`${baseUrl}/orders`);
    assert.equal(r.status, 200);
    const body = await r.json();
    assert.equal(body.count, 1);
    assert.equal(body.orders[0].order_id, 'a');

    const hidden = await fetch(`${baseUrl}/orders/b`);
    assert.equal(hidden.status, 404);
  } finally {
    server.close();
  }
});
