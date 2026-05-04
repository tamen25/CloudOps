'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp, createMetrics, createMetricsApp } = require('../src/app');

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
  };
}

async function startServer(pool, metricsOrOptions) {
  const options = metricsOrOptions && metricsOrOptions.registry ? { metrics: metricsOrOptions } : (metricsOrOptions || {});
  const { app } = createApp({
    pool,
    logger: createLogger(),
    nodeEnv: 'test',
    awsRegion: 'us-east-1',
    ...options,
  });

  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${port}`,
      });
    });
  });
}

async function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

test('GET /health returns the current service status', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.environment, 'test');
    assert.equal(body.region, 'us-east-1');
  } finally {
    await stopServer(server);
  }
});

test('POST /order creates an order and returns the stored row', async () => {
  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /INSERT INTO orders/);
      assert.equal(params[2], 19.99);

      return {
        rows: [{
          id: 1,
          order_id: params[0],
          items: [{ sku: 'book-1', quantity: 1 }],
          total: params[2],
          environment: params[3],
        }],
        rowCount: 1,
      };
    },
  };

  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ sku: 'book-1', quantity: 1 }],
        total: 19.99,
      }),
    });

    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.match(body.order.order_id, /^ORD-/);
    assert.equal(body.order.environment, 'test');
  } finally {
    await stopServer(server);
  }
});

test('GET /orders returns an object with orders and count', async () => {
  const rows = [
    {
      id: 2,
      order_id: 'ORD-existing',
      items: [{ sku: 'book-2', quantity: 2 }],
      total: 29.99,
      environment: 'test',
    },
  ];

  const pool = {
    query: async (sql) => {
      assert.match(sql, /SELECT \* FROM orders/);

      return {
        rows,
        rowCount: rows.length,
      };
    },
  };

  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/orders`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.orders, rows);
    assert.equal(body.count, 1);
  } finally {
    await stopServer(server);
  }
});

test('POST /order is rate-limited — burst returns 429 after the configured max', async () => {
  const pool = { query: async () => ({ rows: [{ order_id: 'x' }], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool, { rateLimitMax: 2, rateLimitWindowMs: 60_000 });

  try {
    const body = JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 9.99 });
    const headers = { 'Content-Type': 'application/json' };

    const r1 = await fetch(`${baseUrl}/order`, { method: 'POST', headers, body });
    const r2 = await fetch(`${baseUrl}/order`, { method: 'POST', headers, body });
    const r3 = await fetch(`${baseUrl}/order`, { method: 'POST', headers, body });

    assert.equal(r1.status, 201);
    assert.equal(r2.status, 201);
    assert.equal(r3.status, 429);
  } finally {
    await stopServer(server);
  }
});

test('POST /order requires X-Api-Key when apiKey is configured', async () => {
  const pool = { query: async () => ({ rows: [{}], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool, { apiKey: 'secret-123' });

  try {
    const without = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 9.99 }),
    });
    assert.equal(without.status, 401);

    const withWrong = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'wrong' },
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 9.99 }),
    });
    assert.equal(withWrong.status, 401);

    const withRight = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'secret-123' },
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 9.99 }),
    });
    assert.equal(withRight.status, 201);
  } finally {
    await stopServer(server);
  }
});

test('GET /health remains public even when apiKey is configured', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool, { apiKey: 'secret-123' });

  try {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('GET /ready returns 200 when the DB query succeeds', async () => {
  const pool = { query: async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/ready`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ready');
  } finally {
    await stopServer(server);
  }
});

test('GET /ready returns 503 when the DB query fails', async () => {
  const pool = {
    query: async () => {
      throw new Error('connection refused');
    },
  };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/ready`);
    const body = await response.json();

    assert.equal(response.status, 503);
    assert.equal(body.status, 'not_ready');
  } finally {
    await stopServer(server);
  }
});

test('GET /metrics is NOT served by the main app (must be on the internal metrics port)', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/metrics`);
    assert.equal(response.status, 404, '/metrics must not be reachable on the public-facing app');
  } finally {
    await stopServer(server);
  }
});

test('metrics app exposes Prometheus counters after requests', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const metrics = createMetrics({ serviceName: 'order-api', environment: 'test' });
  const { server: appServer, baseUrl: appUrl } = await startServer(pool, metrics);

  const metricsApp = createMetricsApp({ registry: metrics.registry });
  const metricsListen = await new Promise((resolve) => {
    const s = metricsApp.listen(0, '127.0.0.1', () => {
      resolve({ server: s, baseUrl: `http://127.0.0.1:${s.address().port}` });
    });
  });

  try {
    await fetch(`${appUrl}/health`);
    const response = await fetch(`${metricsListen.baseUrl}/metrics`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /http_requests_total/);
    assert.match(body, /http_request_duration_seconds/);
  } finally {
    await stopServer(appServer);
    await stopServer(metricsListen.server);
  }
});
