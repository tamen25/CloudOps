'use strict';

const fs = require('fs/promises');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

// Stable 64-bit advisory lock id. Two halves passed to pg_advisory_lock(int4, int4)
// because pg_advisory_lock(int8) overflows JS number arithmetic.
// Picked once; never change — every concurrent migrator must use the same key.
const LOCK_KEY_HIGH = 0x4f524445; // "ORDE"
const LOCK_KEY_LOW = 0x52415049; // "RAPI"

async function ensureTrackingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        VARCHAR(255) PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function listPendingMigrations(client) {
  const applied = await client.query('SELECT name FROM schema_migrations');
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  const files = await fs.readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .filter((f) => !appliedNames.has(f));
}

async function applyMigration(client, name, logger) {
  const filePath = path.join(MIGRATIONS_DIR, name);
  const sql = await fs.readFile(filePath, 'utf8');

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
  }
}

// Holds a session-level advisory lock for the duration of fn(). Concurrent
// callers (e.g. two migration Job pods racing on a release) block on
// pg_advisory_lock and run sequentially; the lock auto-releases on session
// end, so a crashed migrator does not strand the lock.
async function withAdvisoryLock(client, logger, fn) {
  logger.info({ key: [LOCK_KEY_HIGH, LOCK_KEY_LOW] }, 'acquiring migration advisory lock');
  await client.query('SELECT pg_advisory_lock($1, $2)', [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
  try {
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock($1, $2)', [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
    logger.info('released migration advisory lock');
  }
}

async function runMigrations({ pool, logger }) {
  const client = await pool.connect();
  try {
    await withAdvisoryLock(client, logger, async () => {
      await ensureTrackingTable(client);
      const pending = await listPendingMigrations(client);

      if (pending.length === 0) {
        logger.info('no pending migrations');
        return;
      }

      logger.info({ count: pending.length, migrations: pending }, 'applying migrations');
      for (const name of pending) {
        await applyMigration(client, name, logger);
      }
      logger.info('migrations complete');
    });
  } finally {
    client.release();
  }
}

module.exports = { runMigrations, withAdvisoryLock, LOCK_KEY_HIGH, LOCK_KEY_LOW };
