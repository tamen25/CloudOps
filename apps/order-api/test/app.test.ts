import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp, createMetrics, createMetricsApp } from '../src/app';

// Creates logger.
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

test('global IP rate limit applies to public API routes', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool, {
    ipRateLimitMax: 2,
    rateLimitWindowMs: 60_000,
  });

  try {
    const a = await fetch(`${baseUrl}/health`);
    const b = await fetch(`${baseUrl}/health`);
    const c = await fetch(`${baseUrl}/health`);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(c.status, 429);
  } finally {
    await stopServer(server);
  }
});

test('createApp requires a pool with query()', () => {
  assert.throws(
    () => createApp({ pool: {}, logger: createLogger() }),
    /requires a pool/,
  );
});

test('GET / returns service metadata', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool, { serviceName: 'orders' });

  try {
    const response = await fetch(`${baseUrl}/`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.service, 'orders');
    assert.equal(body.endpoints.createOrder, 'POST /order');
  } finally {
    await stopServer(server);
  }
});

test('POST /order rejects malformed JSON', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"items":',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error, 'invalid_json');
  } finally {
    await stopServer(server);
  }
});

test('POST /order creates an order and returns the stored row', async () => {
  const pool = {
    query: async (sql, params) => {
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && params[0]) || [];
        return { rows: skus.map((sku) => ({ sku, price_cents: 1999 })), rowCount: skus.length };
      }
      if (/^INSERT INTO audit_events/i.test(sql)) {
        return { rows: [], rowCount: 1 };
      }
      assert.match(sql, /INSERT INTO orders/);
      assert.doesNotMatch(sql, /RETURNING \*/);
      assert.match(sql, /RETURNING id, order_id, items, total, environment, tenant_id, created_at/);
      assert.equal(params[2], 19.99);

      return {
        rows: [{
          id: 1,
          order_id: params[0],
          items: [{ sku: 'book-1', quantity: 1 }],
          total: params[2],
          environment: params[3],
          tenant_id: params[4],
          owner_sub: params[5],
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
      assert.match(sql, /FROM orders/);
      assert.doesNotMatch(sql, /SELECT \*/);

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

test('GET /orders/:orderId returns a single order', async () => {
  const row = {
    id: 2,
    order_id: 'ORD-existing',
    items: [{ sku: 'book-2', quantity: 2 }],
    total: 29.99,
    environment: 'test',
    tenant_id: 'default',
    owner_sub: null,
  };

  const pool = {
    query: async (sql, params) => {
      assert.match(sql, /FROM orders/);
      assert.deepEqual(params, ['default', 'ORD-existing']);
      return { rows: [row], rowCount: 1 };
    },
  };

  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/orders/ORD-existing`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.order, row);
  } finally {
    await stopServer(server);
  }
});

test('GET /privacy/export returns user-linked data only', async () => {
  const pool = {
    query: async (sql, params) => {
      if (/FROM orders WHERE tenant_id = \$1 AND owner_sub = \$2/i.test(sql)) {
        assert.deepEqual(params, ['acme', 'user-1']);
        return { rows: [{ order_id: 'ORD-1' }], rowCount: 1 };
      }
      if (/FROM audit_events WHERE tenant_id = \$1 AND actor_id = \$2/i.test(sql)) {
        assert.deepEqual(params, ['acme', 'user-1']);
        return { rows: [{ action: 'order.create' }], rowCount: 1 };
      }
      if (/FROM order_idempotency_keys WHERE tenant_id = \$1 AND subject_scope = \$2/i.test(sql)) {
        assert.deepEqual(params, ['acme', 'user-1']);
        return { rows: [{ idempotency_key: 'idem-1' }], rowCount: 1 };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const { server, baseUrl } = await startServer(pool, {
    jwtVerifier: (req, _res, next) => {
      req.user = { sub: 'user-1', tenant_id: 'acme' };
      next();
    },
  });

  try {
    const response = await fetch(`${baseUrl}/privacy/export`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.orders, [{ order_id: 'ORD-1' }]);
    assert.deepEqual(body.audit_events, [{ action: 'order.create' }]);
    assert.deepEqual(body.idempotency_keys, [{ idempotency_key: 'idem-1' }]);
  } finally {
    await stopServer(server);
  }
});

test('POST /privacy/erase anonymizes direct user links but keeps business rows', async () => {
  const seen = [];
  const pool = {
    query: async (sql, params) => {
      seen.push({ sql, params });
      if (/^UPDATE orders SET owner_sub = NULL/i.test(sql)) return { rows: [], rowCount: 2 };
      if (/^UPDATE audit_events SET actor_id = NULL/i.test(sql)) return { rows: [], rowCount: 3 };
      if (/^DELETE FROM order_idempotency_keys/i.test(sql)) return { rows: [], rowCount: 4 };
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  const { server, baseUrl } = await startServer(pool, {
    jwtVerifier: (req, _res, next) => {
      req.user = { sub: 'user-1', tenant_id: 'acme' };
      next();
    },
  });

  try {
    const response = await fetch(`${baseUrl}/privacy/erase`, { method: 'POST' });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.erased, {
      order_links: 2,
      audit_actor_links: 3,
      idempotency_keys: 4,
    });
    assert.equal(seen.length, 3);
    for (const call of seen) assert.deepEqual(call.params, ['acme', 'user-1']);
  } finally {
    await stopServer(server);
  }
});

test('POST /order returns 500 when the insert fails', async () => {
  const pool = {
    query: async () => {
      throw new Error('insert failed');
    },
  };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ sku: 'book-1', quantity: 1 }], total: 19.99 }),
    });
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Failed to process order');
  } finally {
    await stopServer(server);
  }
});

test('GET /orders returns 500 when the query fails', async () => {
  const pool = {
    query: async () => {
      throw new Error('select failed');
    },
  };
  const { server, baseUrl } = await startServer(pool);

  try {
    const response = await fetch(`${baseUrl}/orders`);
    const body = await response.json();

    assert.equal(response.status, 500);
    assert.equal(body.error, 'Failed to fetch orders');
  } finally {
    await stopServer(server);
  }
});

test('POST /order is rate-limited — burst returns 429 after the configured max', async () => {
  const pool = {
    query: async (sql, params) => {
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && params[0]) || [];
        return { rows: skus.map((sku) => ({ sku, price_cents: 999 })), rowCount: skus.length };
      }
      return { rows: [{ order_id: 'x' }], rowCount: 1 };
    },
  };
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
  const pool = {
    query: async (sql, params) => {
      if (/FROM products WHERE sku = ANY/i.test(sql)) {
        const skus = (params && params[0]) || [];
        return { rows: skus.map((sku) => ({ sku, price_cents: 999 })), rowCount: skus.length };
      }
      return { rows: [{}], rowCount: 1 };
    },
  };
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

// #97 — CSRF Origin allow-list
test('CSRF: state-changing POST is rejected when Origin not in allow-list', async () => {
  process.env.ALLOWED_ORIGINS = 'https://app.example.com,https://admin.example.com';
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://evil.example.com' },
      body: JSON.stringify({ items: [{ sku: 'x', quantity: 1 }], total: 1 }),
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.error, 'origin_not_allowed');
  } finally {
    delete process.env.ALLOWED_ORIGINS;
    await stopServer(server);
  }
});

test('CSRF: state-changing POST is allowed when Origin is in allow-list', async () => {
  process.env.ALLOWED_ORIGINS = 'https://app.example.com';
  const pool = { query: async () => ({ rows: [{ id: 1 }], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://app.example.com' },
      body: JSON.stringify({ items: [{ sku: 'x', quantity: 1 }], total: 1 }),
    });
    // Allowed past Origin check; downstream may still fail on auth/tenant —
    // we only assert the Origin gate did not reject.
    assert.notEqual(res.status, 403);
  } finally {
    delete process.env.ALLOWED_ORIGINS;
    await stopServer(server);
  }
});

test('CSRF: server-to-server POST (no Origin header) bypasses allow-list', async () => {
  process.env.ALLOWED_ORIGINS = 'https://app.example.com';
  const pool = { query: async () => ({ rows: [{ id: 1 }], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ sku: 'x', quantity: 1 }], total: 1 }),
    });
    assert.notEqual(res.status, 403);
  } finally {
    delete process.env.ALLOWED_ORIGINS;
    await stopServer(server);
  }
});

test('CSRF: safe GET is never blocked by Origin check', async () => {
  process.env.ALLOWED_ORIGINS = 'https://app.example.com';
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      headers: { origin: 'https://evil.example.com' },
    });
    assert.equal(res.status, 200);
  } finally {
    delete process.env.ALLOWED_ORIGINS;
    await stopServer(server);
  }
});

test('CSRF: empty ALLOWED_ORIGINS is permissive (back-compat)', async () => {
  delete process.env.ALLOWED_ORIGINS;
  const pool = { query: async () => ({ rows: [{ id: 1 }], rowCount: 1 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://anything.example.com' },
      body: JSON.stringify({ items: [{ sku: 'x', quantity: 1 }], total: 1 }),
    });
    assert.notEqual(res.status, 403);
  } finally {
    await stopServer(server);
  }
});

// #101 — security headers
test('helmet: security headers are present on every response', async () => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const { server, baseUrl } = await startServer(pool);
  try {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    // Helmet defaults we explicitly want
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
    assert.match(res.headers.get('strict-transport-security') || '', /max-age=31536000/);
    assert.equal(res.headers.get('cross-origin-resource-policy'), 'same-origin');
    // X-Powered-By must be removed
    assert.equal(res.headers.get('x-powered-by'), null);
    // JSON API uses a deny-all CSP rather than omitting the header.
    assert.equal(
      res.headers.get('content-security-policy'),
      "default-src 'none';base-uri 'none';form-action 'none';frame-ancestors 'none'",
    );
  } finally {
    await stopServer(server);
  }
});
