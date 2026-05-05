'use strict';

const express = require('express');
const pino = require('pino');
const rateLimit = require('express-rate-limit');
const { timingSafeEqual } = require('crypto');
const { Registry, Counter, Histogram } = require('prom-client');

// Order payload schema (closes backlog #44).
// - items: 1–50 entries, each { sku: 1–64 chars, quantity: 1–999 integer }.
// - total: 0 ≤ x ≤ 1_000_000, max 2 decimals (cents).
// All bounds are intentionally generous for a sample API; tighten per product
// rules when real billing lands.
const MAX_ITEMS = 50;
const MAX_SKU_LEN = 64;
const MAX_QUANTITY = 999;
const MAX_TOTAL = 1_000_000;

function validateOrderPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const { items, total } = body;

  if (!Array.isArray(items)) {
    return { ok: false, error: 'items must be an array' };
  }
  if (items.length < 1 || items.length > MAX_ITEMS) {
    return { ok: false, error: `items length must be between 1 and ${MAX_ITEMS}` };
  }
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (!it || typeof it !== 'object' || Array.isArray(it)) {
      return { ok: false, error: `items[${i}] must be an object` };
    }
    if (typeof it.sku !== 'string' || it.sku.length < 1 || it.sku.length > MAX_SKU_LEN) {
      return { ok: false, error: `items[${i}].sku must be a 1–${MAX_SKU_LEN} char string` };
    }
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QUANTITY) {
      return { ok: false, error: `items[${i}].quantity must be an integer 1–${MAX_QUANTITY}` };
    }
  }

  if (typeof total !== 'number' || !Number.isFinite(total)) {
    return { ok: false, error: 'total must be a finite number' };
  }
  if (total < 0 || total > MAX_TOTAL) {
    return { ok: false, error: `total must be between 0 and ${MAX_TOTAL}` };
  }
  // Reject more than 2 decimal places so DECIMAL columns don't truncate
  // silently. Tolerance covers IEEE 754 drift (e.g. 19.99 * 100 = 1998.9999...).
  if (Math.abs(total * 100 - Math.round(total * 100)) > 1e-6) {
    return { ok: false, error: 'total must have at most 2 decimal places' };
  }

  return {
    ok: true,
    value: {
      items: items.map((it) => ({ sku: it.sku, quantity: it.quantity })),
      total,
    },
  };
}

function createMetrics({ serviceName = 'order-api', environment = 'dev' } = {}) {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName, environment });

  const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  return { registry, httpRequestsTotal, httpRequestDuration };
}

function createApp({
  pool,
  logger = pino({ level: 'info' }),
  nodeEnv = 'dev',
  awsRegion = 'us-east-1',
  serviceName = 'order-api',
  // Shared-secret gate for the data endpoints (/order, /orders). When unset
  // those routes are open — useful for local dev and CI without a secret.
  // Set via API_KEY env var in server.js.
  apiKey = '',
  // Optional pre-built JWT verifier middleware (closes backlog #7). When
  // present, runs BEFORE requireApiKey: a valid Bearer token sets req.user
  // and bypasses the API-key check; a missing token falls through; an
  // invalid token short-circuits with 401. server.js builds this from
  // OIDC_* env vars via createJwtVerifier.
  jwtVerifier = null,
  // Per-IP rate limit for the data endpoints (windowMs + max).
  // 60 requests / minute / IP is plenty for a demo and blunts casual abuse.
  rateLimitWindowMs = 60 * 1000,
  rateLimitMax = 60,
  metrics = createMetrics({ serviceName, environment: nodeEnv }),
} = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('createApp requires a pool with a query() function');
  }

  const { registry, httpRequestsTotal, httpRequestDuration } = metrics;

  const app = express();

  // ALB forwards client IP in X-Forwarded-For. Trust one proxy hop so
  // express-rate-limit keys by the real client, not the LB.
  app.set('trust proxy', 1);

  // Closes backlog #44 — cap request body so the API can't be DOS'd by a
  // multi-MB JSON payload from a single client.
  app.use(express.json({ limit: '64kb' }));

  // Handle body-parser errors (oversize body, malformed JSON) cleanly so
  // express's default handler does not dump a stack trace to stderr.
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'payload_too_large' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'invalid_json' });
    }
    return next(err);
  });

  app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
      const route = req.route ? req.route.path : req.path;
      const labels = {
        method: req.method,
        route,
        status: String(res.statusCode),
      };

      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
    });

    next();
  });

  // Liveness: process is alive. Does NOT touch the DB — DB blips must not
  // restart the pod.
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'ok',
      environment: nodeEnv,
      region: awsRegion,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Readiness: DB reachable. Removes pod from Service endpoints on failure
  // without restarting the process.
  app.get('/ready', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (err) {
      logger.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready', error: 'database_unreachable' });
    }
  });

  // Two-tier rate limit (closes backlog #45). Order matters: the unauth
  // limiter runs FIRST and sees raw client IPs, blunting credential
  // stuffing / token-brute-force attempts. The authenticated limiter runs
  // AFTER auth+tenant resolution and keys by tenant_id ?? user.sub ?? IP,
  // so a noisy tenant cannot exhaust the per-IP budget for everyone behind
  // a shared egress.
  const unauthLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: Math.max(rateLimitMax * 2, 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
  });

  const dataLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
    keyGenerator: (req) => {
      // Prefer tenant-scoped keys so one tenant's burst can't starve others.
      // Fall back to JWT subject, then IP. The IP fallback keeps the limit
      // working in dev/test envs where neither JWT nor X-Tenant-Id is set.
      if (req.tenantId) return `tenant:${req.tenantId}`;
      if (req.user && req.user.sub) return `user:${req.user.sub}`;
      return `ip:${req.ip}`;
    },
  });

  // Simple shared-secret gate for data endpoints. Use timingSafeEqual to avoid
  // exposing the length or prefix of the configured key via response timing.
  // When a JWT verifier is configured AND req.user was set by it, this
  // middleware skips the API-key check (the token already authenticated).
  const requireApiKey = (req, res, next) => {
    if (req.user) return next();
    if (!apiKey) return next();

    const presented = req.get('x-api-key') || '';
    const a = Buffer.from(presented);
    const b = Buffer.from(apiKey);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    next();
  };

  // Tenant resolution (closes backlog #8). Order of precedence:
  //   1. JWT claim — `tenant_id` (preferred — issued + signed by IdP).
  //   2. X-Tenant-Id header — only honored when running on the API-key path
  //      (req.user not set). With OIDC the JWT is the source of truth.
  //   3. Local/dev fallback — `default` tenant when NODE_ENV is dev/test/local.
  // Anything else returns 400 invalid_tenant.
  const TENANT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  const TENANT_FALLBACK_ENVS = new Set(['dev', 'test', 'local']);
  const requireTenant = (req, res, next) => {
    let tenantId = '';
    if (req.user && typeof req.user.tenant_id === 'string') {
      tenantId = req.user.tenant_id;
    } else if (!req.user) {
      const header = req.get('x-tenant-id');
      if (typeof header === 'string' && header.length > 0) {
        tenantId = header;
      } else if (TENANT_FALLBACK_ENVS.has(nodeEnv)) {
        tenantId = 'default';
      }
    }

    if (!TENANT_RE.test(tenantId)) {
      return res.status(400).json({ error: 'invalid_tenant', detail: 'tenant_id missing or malformed' });
    }
    req.tenantId = tenantId;
    next();
  };

  // Auth chain for data endpoints: unauth IP limiter (cheap brute-force
  // shield) → JWT verifier → API-key fallback → tenant resolution → tenant
  // rate limiter. Closes #7 + #8 + #45.
  const authChain = jwtVerifier
    ? [unauthLimiter, jwtVerifier, requireApiKey, requireTenant, dataLimiter]
    : [unauthLimiter, requireApiKey, requireTenant, dataLimiter];

  // Closes backlog #51 — wraps a query in a transaction with
  // `SET LOCAL app.tenant_id` so the RLS policy `tenant_isolation` can
  // enforce row-level isolation. App-side `WHERE tenant_id = $1` clauses
  // remain (defence in depth) but the database now refuses to read or
  // write rows for any other tenant even if those clauses regress.
  // When the injected pool has no `connect()` (test mocks), falls back to
  // `pool.query` directly — RLS is a runtime DB concern, so the test path
  // does not need to model transactions.
  async function withTenant(tenantId, fn) {
    if (typeof pool.connect !== 'function') {
      return fn(pool);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // set_config is parameterised; SET LOCAL is not.
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
      throw err;
    } finally {
      client.release();
    }
  }

  app.post('/order', ...authChain, async (req, res) => {
    // Closes backlog #44 — explicit schema for the order payload. Rejects
    // unexpected shapes (non-array items, missing sku/quantity, NaN total,
    // out-of-range total, oversize item list) with a single 400 + reason
    // before they reach Postgres. Keep the validator hand-rolled so we don't
    // pull a JSON-schema runtime in just for this surface.
    const validation = validateOrderPayload(req.body);
    if (!validation.ok) {
      return res.status(400).json({ success: false, error: 'invalid_request', detail: validation.error });
    }

    const { items, total } = validation.value;
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

    try {
      const result = await withTenant(req.tenantId, (client) =>
        client.query(
          'INSERT INTO orders (order_id, items, total, environment, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [orderId, JSON.stringify(items), total, nodeEnv, req.tenantId],
        ),
      );

      logger.info({ orderId, total, tenant: req.tenantId }, 'order created');
      res.status(201).json({ success: true, order: result.rows[0] });
    } catch (err) {
      logger.error({ err }, 'failed to create order');
      res.status(500).json({ success: false, error: 'Failed to process order' });
    }
  });

  app.get('/orders', ...authChain, async (req, res) => {
    try {
      const result = await withTenant(req.tenantId, (client) =>
        client.query(
          'SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100',
          [req.tenantId],
        ),
      );
      res.status(200).json({ orders: result.rows, count: result.rowCount });
    } catch (err) {
      logger.error({ err }, 'failed to fetch orders');
      res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
  });

  app.get('/', (req, res) => {
    res.status(200).json({
      service: serviceName,
      version: '1.0.0',
      environment: nodeEnv,
      endpoints: {
        health: 'GET /health',
        metrics: 'GET /metrics',
        createOrder: 'POST /order',
        getOrders: 'GET /orders',
      },
    });
  });

  return { app, registry };
}

// Separate HTTP server for Prometheus scraping. Bound on an internal-only port
// so /metrics is never routable through the public ALB ingress.
function createMetricsApp({ registry }) {
  const app = express();

  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });

  app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

  return app;
}

module.exports = {
  createApp,
  createMetrics,
  createMetricsApp,
};
