// This file contains idempotency test logic for order API test.
'use strict';

// Backlog #72 — Idempotency-Key support for POST /order. The actual
// concurrency fence (PRIMARY KEY + ON CONFLICT DO NOTHING + SELECT FOR
// UPDATE) is enforced by Postgres in deployed envs. These tests prove the
// app issues the right SQL, replays a stored response on retry, and 409s
// on payload reuse with a different body.

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, hashOrderPayload } = require('../src/app');

// Handles silent logger.
function silentLogger() { return { info() {}, warn() {}, error() {} }; }

// In-memory pool that simulates the pieces of Postgres semantics we rely on:
//   - orders INSERT
//   - order_idempotency_keys INSERT ON CONFLICT DO NOTHING (returns 0 rows
//     when (tenant_id, idempotency_key) already exists)
//   - SELECT ... FOR UPDATE
//   - UPDATE
//   - tenant scoping via SET LOCAL app.tenant_id
function makePool() {
  const orders = [];
  const idempotency = new Map(); // key: `${tenant}|${idempKey}` -> row

  const client = {
    query: async (sql, params) => {
      if (/^BEGIN$/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^COMMIT$/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^ROLLBACK$/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/set_config/i.test(sql)) return { rows: [], rowCount: 0 };

      if (/^INSERT INTO order_idempotency_keys/i.test(sql)) {
        const [tenant, idempKey, requestHash /*, ttlMs */] = params;
        const k = `${tenant}|${idempKey}`;
        if (idempotency.has(k)) {
          return { rows: [], rowCount: 0 };
        }
        idempotency.set(k, {
          tenant_id: tenant,
          idempotency_key: idempKey,
          request_hash: requestHash,
          status_code: 0,
          response_body: {},
          order_id: null,
        });
        return { rows: [{ tenant_id: tenant }], rowCount: 1 };
      }

      if (/^SELECT request_hash, status_code, response_body[\s\S]+FROM order_idempotency_keys/i.test(sql)) {
        const [tenant, idempKey] = params;
        const row = idempotency.get(`${tenant}|${idempKey}`);
        return row
          ? { rows: [{ request_hash: row.request_hash, status_code: row.status_code, response_body: row.response_body }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }

      if (/^UPDATE order_idempotency_keys/i.test(sql)) {
        const [tenant, idempKey, statusCode, responseBody, orderId] = params;
        const k = `${tenant}|${idempKey}`;
        const row = idempotency.get(k);
        if (row) {
          row.status_code = statusCode;
          row.response_body = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          row.order_id = orderId;
        }
        return { rows: [], rowCount: row ? 1 : 0 };
      }

      if (/^INSERT INTO orders/i.test(sql)) {
        const [order_id, items, total, environment, tenant_id] = params;
        const row = { id: orders.length + 1, order_id, items, total, environment, tenant_id };
        orders.push(row);
        return { rows: [row], rowCount: 1 };
      }

      if (/^INSERT INTO audit_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`unexpected SQL: ${sql}`);
    },
    // Handles release.
    release() { /* no-op */ },
  };

  const pool = {
    connect: async () => client,
    query: client.query,
  };
  return { pool, orders, idempotency };
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

// Handles base headers.
const baseHeaders = (extra = {}) => ({
  'Content-Type': 'application/json',
  'X-Api-Key': 'shared',
  'X-Tenant-Id': 'acme',
  ...extra,
});
const validBody = { items: [{ sku: 'a', quantity: 1 }], total: 1 };

test('first POST /order with Idempotency-Key creates the order and stores the response', async () => {
  const { pool, orders, idempotency } = makePool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders({ 'Idempotency-Key': 'abc-123' }),
      body: JSON.stringify(validBody),
    });
    assert.equal(res.status, 201);
    assert.equal(orders.length, 1);
    assert.equal(idempotency.size, 1);
    const row = idempotency.get('acme|abc-123');
    assert.equal(row.status_code, 201);
    assert.equal(row.order_id, orders[0].order_id);
  } finally {
    server.close();
  }
});

test('exact retry replays the stored response and does NOT create a duplicate order', async () => {
  const { pool, orders } = makePool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const opts = {
      method: 'POST',
      headers: baseHeaders({ 'Idempotency-Key': 'retry-key' }),
      body: JSON.stringify(validBody),
    };
    const first = await fetch(`${baseUrl}/order`, opts);
    const firstBody = await first.json();
    assert.equal(first.status, 201);
    assert.equal(orders.length, 1);

    const second = await fetch(`${baseUrl}/order`, opts);
    const secondBody = await second.json();
    assert.equal(second.status, 201);
    assert.equal(orders.length, 1, 'retry must not create a duplicate row');
    assert.deepEqual(secondBody, firstBody, 'replay returns the original response body');
  } finally {
    server.close();
  }
});

test('reusing the key with a different payload returns 409', async () => {
  const { pool } = makePool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const r1 = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders({ 'Idempotency-Key': 'shared-key' }),
      body: JSON.stringify({ items: [{ sku: 'a', quantity: 1 }], total: 1 }),
    });
    assert.equal(r1.status, 201);

    const r2 = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders({ 'Idempotency-Key': 'shared-key' }),
      body: JSON.stringify({ items: [{ sku: 'a', quantity: 99 }], total: 99 }),
    });
    assert.equal(r2.status, 409);
    const body = await r2.json();
    assert.equal(body.error, 'idempotency_conflict');
  } finally {
    server.close();
  }
});

test('cross-tenant key isolation: same idempotency key works under different tenants', async () => {
  const { pool, orders } = makePool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const a = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme', 'Idempotency-Key': 'k1' },
      body: JSON.stringify(validBody),
    });
    const b = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'globex', 'Idempotency-Key': 'k1' },
      body: JSON.stringify(validBody),
    });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(orders.length, 2, 'each tenant gets its own order');
    assert.equal(orders[0].tenant_id, 'acme');
    assert.equal(orders[1].tenant_id, 'globex');
  } finally {
    server.close();
  }
});

test('malformed Idempotency-Key (whitespace) is rejected with 400', async () => {
  const { pool, orders } = makePool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: baseHeaders({ 'Idempotency-Key': 'has spaces' }),
      body: JSON.stringify(validBody),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, 'invalid_request');
    assert.equal(orders.length, 0);
  } finally {
    server.close();
  }
});

test('hashOrderPayload is stable across equivalent inputs and changes when the payload changes', () => {
  const a = hashOrderPayload({ items: [{ sku: 'a', quantity: 1 }], total: 1 });
  const b = hashOrderPayload({ items: [{ sku: 'a', quantity: 1 }], total: 1 });
  const c = hashOrderPayload({ items: [{ sku: 'a', quantity: 2 }], total: 2 });
  assert.equal(a, b);
  assert.notEqual(a, c);
});
