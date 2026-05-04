'use strict';

// Standalone migration entrypoint — invoked as a Kubernetes Job before each
// deploy so application pods never race each other on schema changes.
// Closes backlog #21.

const pino = require('pino');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { Pool } = require('pg');
const { runMigrations } = require('./migrations');

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const DB_SECRET_ARN = process.env.DB_SECRET_ARN;
const DB_NAME = process.env.DB_NAME || 'cloudops';

const logger = pino({ level: 'info' });

async function main() {
  if (!DB_SECRET_ARN) {
    throw new Error('DB_SECRET_ARN is required');
  }

  const smClient = new SecretsManagerClient({ region: AWS_REGION });
  const response = await smClient.send(new GetSecretValueCommand({ SecretId: DB_SECRET_ARN }));
  const secret = JSON.parse(response.SecretString);

  const pool = new Pool({
    host: secret.host,
    port: secret.port || 5432,
    database: DB_NAME,
    user: secret.username,
    password: secret.password,
    max: 1,
    idleTimeoutMillis: 1000,
    connectionTimeoutMillis: 5000,
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
