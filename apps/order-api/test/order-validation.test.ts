// This file contains order validation test logic for order API test.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Validator is internal to app.ts — exercise it through POST /order.
const { createApp, validateOrderPayload } = require('../src/app');

// Handles silent logger.
function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

// Handles start server.
async function startServer() {
  const pool = {
    query: async () => ({ rows: [{ order_id: 'ok' }], rowCount: 1 }),
  };
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    awsRegion: 'us-east-1',
    rateLimitMax: 1000,
  });
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// Handles post.
async function post(baseUrl, body) {
  return fetch(`${baseUrl}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('POST /order rejects empty items array', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [], total: 0 });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /items length/);
  } finally {
    server.close();
  }
});

test('POST /order rejects items without sku/quantity', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ name: 'oops' }], total: 1 });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /sku/);
  } finally {
    server.close();
  }
});

test('POST /order rejects items where an entry is not an object (null)', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [null], total: 1 });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /must be an object/);
  } finally {
    server.close();
  }
});

test('POST /order rejects non-finite total (NaN)', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ sku: 'a', quantity: 1 }], total: 'not-a-number' });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /finite number/);
  } finally {
    server.close();
  }
});

test('POST /order rejects fractional quantity', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ sku: 'a', quantity: 1.5 }], total: 1 });
    assert.equal(r.status, 400);
  } finally {
    server.close();
  }
});

test('POST /order rejects total above cap', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ sku: 'a', quantity: 1 }], total: 1_000_001 });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /total/);
  } finally {
    server.close();
  }
});

test('POST /order rejects more than 2 decimal places on total', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ sku: 'a', quantity: 1 }], total: 1.234 });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.match(body.detail, /decimal/);
  } finally {
    server.close();
  }
});

test('POST /order accepts a valid payload', async () => {
  const { server, baseUrl } = await startServer();
  try {
    const r = await post(baseUrl, { items: [{ sku: 'book-1', quantity: 2 }], total: 39.98 });
    assert.equal(r.status, 201);
  } finally {
    server.close();
  }
});

test('POST /order rejects oversize body (>64kb)', async () => {
  const { server, baseUrl } = await startServer();
  try {
    // 65k of payload — express.json should reject before the validator runs.
    const big = 'x'.repeat(65 * 1024);
    const r = await post(baseUrl, JSON.stringify({ items: [{ sku: big, quantity: 1 }], total: 1 }));
    assert.ok(r.status >= 400 && r.status < 500, `expected 4xx, got ${r.status}`);
  } finally {
    server.close();
  }
});

test('total must be a finite number — rejects NaN', () => {
  const res = validateOrderPayload({ items: [{ sku: 'a', quantity: 1 }], total: Number.NaN });
  assert.equal(res.ok, false);
  if (res.ok === false) assert.match(res.error, /finite/);
});

test('total must be a finite number — rejects Infinity', () => {
  const res = validateOrderPayload({ items: [{ sku: 'a', quantity: 1 }], total: Number.POSITIVE_INFINITY });
  assert.equal(res.ok, false);
  if (res.ok === false) assert.match(res.error, /finite/);
});
