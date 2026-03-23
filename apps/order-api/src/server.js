// tracing must be required first — it patches modules before they are loaded
require('./tracing');

const express = require('express');
const pino = require('pino');
const { register, Counter, Histogram } = require('prom-client');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'dev';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const DB_NAME = process.env.DB_NAME || 'cloudops';

const logger = pino({ level: 'info' });

// Prometheus metrics
register.setDefaultLabels({ service: 'order-api', environment: NODE_ENV });

const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status'],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
});

let pool;

// Fetch DB credentials from Secrets Manager and initialize pg connection pool
async function initDatabase() {
  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }));
  const secret = JSON.parse(response.SecretString);

  pool = new Pool({
    host: secret.host,
    port: secret.port || 5432,
    database: DB_NAME,
    user: secret.username,
    password: secret.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Ensure orders table exists on startup
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id          SERIAL PRIMARY KEY,
      order_id    VARCHAR(64) UNIQUE NOT NULL,
      items       JSONB           DEFAULT '[]',
      total       NUMERIC(10, 2)  DEFAULT 0,
      environment VARCHAR(32),
      created_at  TIMESTAMPTZ     DEFAULT NOW()
    )
  `);

  logger.info('database initialized');
}

const app = express();
app.use(express.json());

// Record http_requests_total and http_request_duration_seconds for every response
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const route = req.route ? req.route.path : req.path;
    const labels = { method: req.method, route, status: res.statusCode };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
  });
  next();
});

// Liveness / readiness probe
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    environment: NODE_ENV,
    region: AWS_REGION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Prometheus scrape endpoint
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Create order and persist to PostgreSQL
app.post('/order', async (req, res) => {
  const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const { items = [], total = 0 } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO orders (order_id, items, total, environment) VALUES ($1, $2, $3, $4) RETURNING *',
      [orderId, JSON.stringify(items), total, NODE_ENV],
    );
    logger.info({ orderId, total }, 'order created');
    res.status(201).json({ success: true, order: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'failed to create order');
    res.status(500).json({ success: false, error: 'Failed to process order' });
  }
});

// Return last 100 orders from PostgreSQL
app.get('/orders', async (req, res) => {
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
    service: 'order-api',
    version: '1.0.0',
    environment: NODE_ENV,
    endpoints: {
      health: 'GET /health',
      metrics: 'GET /metrics',
      createOrder: 'POST /order',
      getOrders: 'GET /orders',
    },
  });
});

// Graceful shutdown: stop accepting requests, drain in-flight up to 30s, close DB pool
let server;

function shutdown() {
  logger.info('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    logger.info('HTTP server closed');
    pool.end(() => {
      logger.info('DB pool closed');
      process.exit(0);
    });
  });
  setTimeout(() => {
    logger.warn('forced shutdown after 30s drain timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize DB then start listening
initDatabase()
  .then(() => {
    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT, env: NODE_ENV, region: AWS_REGION }, 'order-api started');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'failed to initialize database');
    process.exit(1);
  });
