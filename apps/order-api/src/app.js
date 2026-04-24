'use strict';

const express = require('express');
const pino = require('pino');
const rateLimit = require('express-rate-limit');
const { timingSafeEqual } = require('crypto');
const { Registry, Counter, Histogram } = require('prom-client');

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

  app.use(express.json());

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

  const dataLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
  });

  // Simple shared-secret gate for data endpoints. Use timingSafeEqual to avoid
  // exposing the length or prefix of the configured key via response timing.
  const requireApiKey = (req, res, next) => {
    if (!apiKey) return next();

    const presented = req.get('x-api-key') || '';
    const a = Buffer.from(presented);
    const b = Buffer.from(apiKey);

    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    next();
  };

  app.post('/order', dataLimiter, requireApiKey, async (req, res) => {
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const { items = [], total = 0 } = req.body;

    try {
      const result = await pool.query(
        'INSERT INTO orders (order_id, items, total, environment) VALUES ($1, $2, $3, $4) RETURNING *',
        [orderId, JSON.stringify(items), total, nodeEnv],
      );

      logger.info({ orderId, total }, 'order created');
      res.status(201).json({ success: true, order: result.rows[0] });
    } catch (err) {
      logger.error({ err }, 'failed to create order');
      res.status(500).json({ success: false, error: 'Failed to process order' });
    }
  });

  app.get('/orders', dataLimiter, requireApiKey, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
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
