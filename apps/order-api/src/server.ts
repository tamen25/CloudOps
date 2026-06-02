// This file contains server logic for order API src.
// tracing must be imported first — it patches modules before they are loaded
import './tracing';

import * as fs from 'fs';
import { createLogger } from './logger';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool, type PoolConfig } from 'pg';
import type { Server } from 'http';
import { createApp, createMetricsApp, createMetrics } from './app';
import { assertAuthConfigured } from './auth-config';
import { createJwtVerifier } from './auth-jwt';
import { createPublisher } from './kinesis';

const PORT = Number(process.env.PORT) || 3000;
const METRICS_PORT = Number(process.env.METRICS_PORT) || 9090;
const NODE_ENV = process.env.NODE_ENV || 'dev';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const DB_NAME = process.env.DB_NAME || 'cloudops';
const DB_SSL_CA_BUNDLE = process.env.DB_SSL_CA_BUNDLE || '';
const DB_SSL_DISABLED = process.env.DB_SSL_DISABLED === 'true';
const API_KEY = process.env.API_KEY || '';
const API_KEY_SECRET_ARN = process.env.API_KEY_SECRET_ARN || '';

const OIDC_ISSUER = process.env.OIDC_ISSUER || '';
const OIDC_AUDIENCE = process.env.OIDC_AUDIENCE || '';
const OIDC_JWKS_URL = process.env.OIDC_JWKS_URL || '';
const OIDC_REQUIRED_SCOPES = (process.env.OIDC_REQUIRED_SCOPES || '')
  .split(/\s+/)
  .filter(Boolean);

const logger = createLogger();

let pool: Pool;

// Initializes database.
async function initDatabase(): Promise<void> {
  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }));
  const secret = JSON.parse(response.SecretString || '{}');

  let ssl: PoolConfig['ssl'] = false;
  if (!DB_SSL_DISABLED && NODE_ENV !== 'test' && NODE_ENV !== 'local') {
    const sslOptions: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: true };
    if (DB_SSL_CA_BUNDLE) {
      try {
        sslOptions.ca = fs.readFileSync(DB_SSL_CA_BUNDLE, 'utf8');
        logger.info({ caPath: DB_SSL_CA_BUNDLE }, 'loaded RDS CA bundle');
      } catch (err) {
        logger.error({ err, caPath: DB_SSL_CA_BUNDLE }, 'failed to read DB_SSL_CA_BUNDLE — falling back to system trust store');
      }
    }
    ssl = sslOptions;
  }

  pool = new Pool({
    host: secret.host,
    port: secret.port || 5432,
    database: DB_NAME,
    user: secret.username,
    password: secret.password,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl,
  });

  await pool.query('SELECT 1');
  logger.info('database initialized');
}

let server: Server;
let metricsServer: Server | undefined;

// Handles shutdown.
function shutdown(): void {
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

// Handles resolve API key.
async function resolveApiKey(): Promise<string> {
  if (API_KEY) return API_KEY;
  if (!API_KEY_SECRET_ARN) return '';

  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: API_KEY_SECRET_ARN }));

  try {
    const parsed = JSON.parse(response.SecretString || '');
    return parsed.api_key || parsed.apiKey || parsed.value || '';
  } catch (err) {
    //SM SecretString was not valid JSON — fall back to treating the whole
    //value as the plaintext key (closes backlog #106). Logged at warn so an
    //operator notices if a JSON-encoded secret is rotated to plaintext or
    //vice versa.
    logger.warn(
      { secret_arn: API_KEY_SECRET_ARN, error: err instanceof Error ? err.message : String(err) },
      'secrets-manager SecretString is not JSON; using raw value as api key',
    );
    return response.SecretString || '';
  }
}

initDatabase()
  .then(async () => {
    const apiKey = await resolveApiKey();

    // Metrics created up-front so the JWT verifier can record outcomes
    // into the same registry (closes backlog #104).
    const metrics = createMetrics({ serviceName: 'order-api', environment: NODE_ENV });

    let jwtVerifier = null;
    if (OIDC_ISSUER && OIDC_AUDIENCE && OIDC_JWKS_URL) {
      jwtVerifier = createJwtVerifier({
        issuer: OIDC_ISSUER,
        audience: OIDC_AUDIENCE,
        jwksUrl: OIDC_JWKS_URL,
        requiredScopes: OIDC_REQUIRED_SCOPES,
        logger,
        onOutcome: (outcome) => metrics.jwtVerifyTotal.inc({ outcome }),
      });
      logger.info({ issuer: OIDC_ISSUER, audience: OIDC_AUDIENCE }, 'oidc verifier configured');
    }

    assertAuthConfigured({ apiKey, jwtVerifier, nodeEnv: NODE_ENV, logger });

    const publisher = createPublisher({ awsRegion: AWS_REGION, logger });
    const { app } = createApp({
      pool,
      logger,
      nodeEnv: NODE_ENV,
      awsRegion: AWS_REGION,
      apiKey,
      jwtVerifier,
      metrics,
      publishOrderEvent: publisher.publishOrderEvent,
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
