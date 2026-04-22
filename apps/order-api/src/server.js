// tracing must be required first — it patches modules before they are loaded
require('./tracing');

const pino = require('pino');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');
const { createApp, createMetricsApp, createMetrics } = require('./app');
const { runMigrations } = require('./migrations');

const PORT = process.env.PORT || 3000;
const METRICS_PORT = process.env.METRICS_PORT || 9090;
const NODE_ENV = process.env.NODE_ENV || 'dev';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const DB_NAME = process.env.DB_NAME || 'cloudops';
// Optional shared-secret gate for /order and /orders. Set directly or via
// API_KEY_SECRET_ARN below. Empty = endpoints are open.
const API_KEY = process.env.API_KEY || '';
const API_KEY_SECRET_ARN = process.env.API_KEY_SECRET_ARN || '';

const logger = pino({ level: 'info' });

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

  await runMigrations({ pool, logger });
  logger.info('database initialized');
}

// Graceful shutdown: stop accepting requests, drain in-flight up to 30s, close DB pool
let server;
let metricsServer;

function shutdown() {
  logger.info('SIGTERM received, starting graceful shutdown');
  server.close(() => {
    logger.info('HTTP server closed');
    if (metricsServer) metricsServer.close();
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

async function resolveApiKey() {
  if (API_KEY) return API_KEY;
  if (!API_KEY_SECRET_ARN) return '';

  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: API_KEY_SECRET_ARN }));

  try {
    const parsed = JSON.parse(response.SecretString);
    return parsed.api_key || parsed.apiKey || parsed.value || '';
  } catch {
    return response.SecretString;
  }
}

// Initialize DB then start listening
initDatabase()
  .then(async () => {
    const apiKey = await resolveApiKey();
    if (!apiKey) {
      logger.warn('API_KEY not configured — /order and /orders are unauthenticated');
    }

    const metrics = createMetrics({ serviceName: 'order-api', environment: NODE_ENV });
    const { app } = createApp({
      pool,
      logger,
      nodeEnv: NODE_ENV,
      awsRegion: AWS_REGION,
      apiKey,
      metrics,
    });

    server = app.listen(PORT, '0.0.0.0', () => {
      logger.info({ port: PORT, env: NODE_ENV, region: AWS_REGION }, 'order-api started');
    });

    const metricsApp = createMetricsApp({ registry: metrics.registry });
    metricsServer = metricsApp.listen(METRICS_PORT, '0.0.0.0', () => {
      logger.info({ port: METRICS_PORT }, 'metrics server started');
    });
  })
  .catch((err) => {
    logger.error({ err }, 'failed to initialize database');
    process.exit(1);
  });
