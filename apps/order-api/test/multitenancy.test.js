'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

function makePool({ store }) {
  return {
    query: async (sql, params) => {
      if (/^INSERT INTO orders/i.test(sql)) {
        const [order_id, items, total, environment, tenant_id] = params;
        const row = { id: store.length + 1, order_id, items, total, environment, tenant_id };
        store.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (/^SELECT \* FROM orders WHERE tenant_id/i.test(sql)) {
        const [tenant_id] = params;
        const rows = store.filter((r) => r.tenant_id === tenant_id);
        return { rows, rowCount: rows.length };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

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
