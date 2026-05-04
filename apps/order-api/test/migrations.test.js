'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { withAdvisoryLock, LOCK_KEY_HIGH, LOCK_KEY_LOW } = require('../src/migrations');

function createLogger() {
  return { info() {}, warn() {}, error() {} };
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
