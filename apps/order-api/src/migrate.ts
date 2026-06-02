// This file contains migrate logic for order API src.
// Standalone migration entrypoint — invoked as a Kubernetes Job before each
// deploy so application pods never race each other on schema changes.
// Closes backlog #21.

import * as fs from 'fs';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Pool, type PoolConfig } from 'pg';
import { createLogger } from './logger';
import { runMigrations } from './migrations';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const DB_NAME = process.env.DB_NAME || 'cloudops';
const NODE_ENV = process.env.NODE_ENV || 'dev';
const DB_SSL_CA_BUNDLE = process.env.DB_SSL_CA_BUNDLE || '';
const DB_SSL_DISABLED = process.env.DB_SSL_DISABLED === 'true';

const logger = createLogger();

// Runs the main workflow for the requested work.
async function main(): Promise<void> {
  if (!DB_SECRET_ARN) {
    throw new Error('DB_SECRET_ARN is required');
  }

  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }));
  const secret = JSON.parse(response.SecretString || '{}');

  // Backlog #57 — match server.ts TLS config so migrations also talk TLS.
  let ssl: PoolConfig['ssl'] = false;
  if (!DB_SSL_DISABLED && NODE_ENV !== 'test' && NODE_ENV !== 'local') {
    const sslOptions: { rejectUnauthorized: boolean; ca?: string } = { rejectUnauthorized: true };
    if (DB_SSL_CA_BUNDLE) {
      try {
        sslOptions.ca = fs.readFileSync(DB_SSL_CA_BUNDLE, 'utf8');
      } catch (err) {
        logger.error({ err, caPath: DB_SSL_CA_BUNDLE }, 'failed to read DB_SSL_CA_BUNDLE — falling back to system trust store');
      }
    }
    ssl = sslOptions;
  }

  const pool = new Pool({
    host: secret.host,
    port: secret.port || 5432,
    database: DB_NAME,
    user: secret.username,
    password: secret.password,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
    ssl,
  });

  try {
    await runMigrations({ pool, logger });
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    logger.info('migration job complete');
    process.exit(0);
  })
  .catch((err) => {
    logger.error({ err }, 'migration job failed');
    process.exit(1);
  });
