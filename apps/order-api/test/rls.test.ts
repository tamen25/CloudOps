// This file contains rls test logic for order API test.
// Backlog #51 — verify the RLS transaction wrapper sets `app.tenant_id`
// before issuing data queries and rolls back on error. The actual policy
// is enforced by Postgres in deployed envs (see migrations/003_rls.sql);
// here we prove the wrapper plumbs the tenant context through every code
// path that touches `pool.connect()`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app';

// Handles silent logger.
function silentLogger() { return { info() {}, warn() {}, error() {} }; }

// Builds recording pool.
function makeRecordingPool() {
  const calls = [];
  let released = 0;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && params[0]) || [];
        return { rows: skus.map((sku) => ({ sku, price_cents: 100 })), rowCount: skus.length };
      }
      if (/^INSERT INTO orders/i.test(sql)) {
        return { rows: [{ order_id: params[0], tenant_id: params[4], owner_sub: params[5] }], rowCount: 1 };
      }
      if (/^SELECT .* FROM orders/i.test(sql)) {
        return { rows: [], rowCount: 0 };
      }
      if (/^INSERT INTO audit_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
    // Handles release.
    release() { released += 1; },
  };
  const pool = {
    connect: async () => client,
    query: client.query,
  };
  return { pool, calls, releasedRef: () => released };
}

// Handles start app.
async function startApp({ pool }) {
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared',
    rateLimitMax: 1000,
  });
  return new Promise((r) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      r({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test('POST /order opens a transaction and SET LOCAL app.tenant_id before INSERT', async () => {
  const { pool, calls, releasedRef } = makeRecordingPool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme' },
      body: JSON.stringify({ items: [{ sku: 'a', quantity: 1 }], total: 1 }),
    });
    assert.equal(res.status, 201);

    // Ordered: BEGIN, set_config(app.tenant_id, acme), SELECT products
    // (re-price guard), INSERT orders, INSERT audit_events (closes #73),
    // COMMIT.
    assert.equal(calls[0].sql, 'BEGIN');
    assert.match(calls[1].sql, /set_config/);
    assert.equal(calls[1].params[0], 'acme');
    assert.match(calls[2].sql, /FROM products WHERE sku = ANY/);
    assert.match(calls[3].sql, /INSERT INTO orders/);
    assert.match(calls[4].sql, /INSERT INTO audit_events/);
    assert.equal(calls[5].sql, 'COMMIT');

    // Client released back to the pool.
    assert.equal(releasedRef(), 1);
  } finally {
    server.close();
  }
});

test('GET /orders sets tenant context for SELECT and rolls back on error', async () => {
  const { pool, calls, releasedRef } = makeRecordingPool();
  // Force the SELECT to throw so we can see ROLLBACK in the call log.
  const realQuery = pool.connect;
  pool.connect = async () => {
    const c = await realQuery();
    const orig = c.query;
    c.query = async (sql, params) => {
      if (/^SELECT .* FROM orders/i.test(sql)) throw new Error('boom');
      return orig(sql, params);
    };
    return c;
  };

  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/orders`, {
      headers: { 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme' },
    });
    assert.equal(res.status, 500);

    // Ordered: BEGIN, set_config, SELECT (throws), ROLLBACK.
    assert.equal(calls[0].sql, 'BEGIN');
    assert.match(calls[1].sql, /set_config/);
    assert.equal(calls[1].params[0], 'acme');
    assert.equal(calls[calls.length - 1].sql, 'ROLLBACK');
    assert.equal(releasedRef(), 1);
  } finally {
    server.close();
  }
});

test('JWT order access sets app.user_sub before data queries', async () => {
  const { pool, calls } = makeRecordingPool();
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    jwtVerifier: (req, _res, next) => {
      req.user = { sub: 'user-1', tenant_id: 'acme' };
      next();
    },
    rateLimitMax: 1000,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(`${baseUrl}/orders`);
    assert.equal(res.status, 200);
    assert.equal(calls[0].sql, 'BEGIN');
    assert.match(calls[1].sql, /app\.tenant_id/);
    assert.match(calls[2].sql, /app\.user_sub/);
    assert.equal(calls[2].params[0], 'user-1');
    assert.match(calls[3].sql, /owner_sub = \$2/);
  } finally {
    server.close();
  }
});
