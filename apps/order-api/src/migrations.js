'use strict';

const fs = require('fs/promises');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureTrackingTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listPendingMigrations(pool) {
  const applied = await pool.query('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !appliedNames.has(f));
}

async function applyMigration(pool, name, logger) {
  const filePath = path.join(MIGRATIONS_DIR, name);
  const sql = await fs.readFile(filePath, 'utf8');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    await client.query('COMMIT');
    logger.info({ migration: name }, 'applied migration');
  } catch (err) {
    await client.query('ROLLBACK');
    logger.error({ err, migration: name }, 'migration failed — rolled back');
    throw err;
  } finally {
    client.release();
  }
}

async function runMigrations({ pool, logger }) {
  await ensureTrackingTable(pool);
  const pending = await listPendingMigrations(pool);

  if (pending.length === 0) {
    logger.info('no pending migrations');
    return;
  }

  logger.info({ count: pending.length, migrations: pending }, 'applying migrations');
  for (const name of pending) {
    await applyMigration(pool, name, logger);
  }
  logger.info('migrations complete');
}

module.exports = { runMigrations };
