import test from 'node:test';
import assert from 'node:assert/strict';
import { withAdvisoryLock, LOCK_KEY_HIGH, LOCK_KEY_LOW, runMigrations } from '../src/migrations';

// Creates logger.
function createLogger() {
  return { info() {}, warn() {}, error() {} };
}

// Creates pool.
function createPool(client) {
  return {
    connect: async () => client,
  };
}

test('withAdvisoryLock acquires and releases the same lock key', async () => {
  const queries = [];
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      return { rows: [], rowCount: 0 };
    },
  };

  const result = await withAdvisoryLock(client, createLogger(), async () => 'inside-fn');

  assert.equal(result, 'inside-fn');
  assert.equal(queries.length, 2);
  assert.match(queries[0].sql, /pg_advisory_lock/);
  assert.deepEqual(queries[0].params, [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
  assert.match(queries[1].sql, /pg_advisory_unlock/);
  assert.deepEqual(queries[1].params, [LOCK_KEY_HIGH, LOCK_KEY_LOW]);
});

test('withAdvisoryLock releases the lock even if the wrapped fn throws', async () => {
  const queries = [];
  const client = {
    query: async (sql) => {
      queries.push(sql);
      return { rows: [], rowCount: 0 };
    },
  };

  await assert.rejects(
    () => withAdvisoryLock(client, createLogger(), async () => { throw new Error('boom'); }),
    /boom/,
  );

  assert.equal(queries.length, 2);
  assert.match(queries[0], /pg_advisory_lock/);
  assert.match(queries[1], /pg_advisory_unlock/);
});

test('runMigrations releases the client when no migrations are pending', async () => {
  const queries = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'SELECT name FROM schema_migrations') {
        return {
          rows: [
            { name: '001_initial.sql' },
            { name: '002_multitenancy.sql' },
            { name: '003_rls.sql' },
            { name: '004_idempotency_keys.sql' },
            { name: '005_audit_events.sql' },
            { name: '006_products.sql' },
            { name: '007_order_ownership.sql' },
          ],
          rowCount: 7,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => { released = true; },
  };

  await runMigrations({ pool: createPool(client), logger: createLogger() });

  assert.equal(released, true);
  assert.equal(queries.some((q) => /schema_migrations/.test(q.sql)), true);
  assert.equal(queries.some((q) => q.sql === 'BEGIN'), false);
});

test('runMigrations applies pending SQL files inside transactions', async () => {
  const queries = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'SELECT name FROM schema_migrations') {
        return {
          rows: [
            { name: '001_initial.sql' },
            { name: '003_rls.sql' },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => { released = true; },
  };

  await runMigrations({ pool: createPool(client), logger: createLogger() });

  assert.equal(released, true);
  assert.equal(queries.some((q) => q.sql === 'BEGIN'), true);
  assert.equal(queries.some((q) => /ALTER TABLE orders/.test(q.sql)), true);
  assert.equal(queries.some((q) => /INSERT INTO schema_migrations/.test(q.sql)), true);
  assert.equal(queries.some((q) => q.sql === 'COMMIT'), true);
});

test('runMigrations rolls back failed migrations and still releases the client', async () => {
  const queries = [];
  let released = false;
  const client = {
    query: async (sql, params) => {
      queries.push({ sql, params });
      if (sql === 'SELECT name FROM schema_migrations') {
        return {
          rows: [
            { name: '002_multitenancy.sql' },
            { name: '003_rls.sql' },
          ],
          rowCount: 2,
        };
      }
      if (/CREATE TABLE IF NOT EXISTS orders/.test(sql)) {
        throw new Error('ddl failed');
      }
      return { rows: [], rowCount: 0 };
    },
    release: () => { released = true; },
  };

  await assert.rejects(
    () => runMigrations({ pool: createPool(client), logger: createLogger() }),
    /ddl failed/,
  );

  assert.equal(released, true);
  assert.equal(queries.some((q) => q.sql === 'ROLLBACK'), true);
  assert.equal(queries.some((q) => /pg_advisory_unlock/.test(q.sql)), true);
});
