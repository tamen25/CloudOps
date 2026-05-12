// This file contains audit test logic for order API test.
'use strict';

// Backlog #73 — verify the audit log write is wired into the order create
// path and uses the same tenant transaction. The actual RLS policy is
// enforced by Postgres in deployed envs (see migrations/005_audit_events.sql).

const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../src/app');

// Handles silent logger.
function silentLogger() { return { info() {}, warn() {}, error() {} }; }

// Builds recording pool.
function makeRecordingPool({ failOrderInsert = false } = {}) {
  const calls = [];
  let released = 0;
  const client = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (/^BEGIN$|^COMMIT$|^ROLLBACK$/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/set_config/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/^INSERT INTO orders/i.test(sql)) {
        if (failOrderInsert) throw new Error('insert blew up');
        return { rows: [{ id: 1, order_id: params[0], items: params[1], total: params[2], environment: params[3], tenant_id: params[4] }], rowCount: 1 };
      }
      if (/^INSERT INTO audit_events/i.test(sql)) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
    // Handles release.
    release() { released += 1; },
  };
  const pool = { connect: async () => client, query: client.query };
  return { pool, calls, releasedRef: () => released };
}

// Handles start app.
async function startApp({ pool }) {
  const { app } = createApp({ pool, logger: silentLogger(), nodeEnv: 'test', apiKey: 'shared', rateLimitMax: 1000 });
  return new Promise((r) => {
    const server = app.listen(0, '127.0.0.1', () => r({ server, baseUrl: `http://127.0.0.1:${server.address().port}` }));
  });
}

const validBody = JSON.stringify({ items: [{ sku: 'a', quantity: 1 }], total: 1 });

test('successful POST /order writes a success audit event in the same transaction', async () => {
  const { pool, calls } = makeRecordingPool();
  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme', 'X-Request-Id': 'req-42' },
      body: validBody,
    });
    assert.equal(res.status, 201);

    const audit = calls.find((c) => /^INSERT INTO audit_events/i.test(c.sql));
    assert.ok(audit, 'audit_events INSERT should have been issued');
    const [tenantId, actorId, action, requestId, resourceId, statusCode, result, errorCode] = audit.params;
    assert.equal(tenantId, 'acme');
    assert.equal(actorId, null, 'API-key path has no actor');
    assert.equal(action, 'order.create');
    assert.equal(requestId, 'req-42');
    assert.match(resourceId, /^ORD-/);
    assert.equal(statusCode, 201);
    assert.equal(result, 'success');
    assert.equal(errorCode, null);

    // The audit insert sits between the orders insert and COMMIT.
    const orderIdx = calls.findIndex((c) => /^INSERT INTO orders/i.test(c.sql));
    const auditIdx = calls.findIndex((c) => /^INSERT INTO audit_events/i.test(c.sql));
    const commitIdx = calls.findIndex((c) => /^COMMIT$/i.test(c.sql));
    assert.ok(orderIdx < auditIdx && auditIdx < commitIdx, 'audit must be inside the order transaction');
  } finally {
    server.close();
  }
});

test('failed POST /order writes a failure audit event after rollback', async () => {
  const { pool, calls } = makeRecordingPool({ failOrderInsert: true });
  const { server, baseUrl } = await startApp({ pool });
  try {
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme' },
      body: validBody,
    });
    assert.equal(res.status, 500);

    const rollback = calls.find((c) => /^ROLLBACK$/i.test(c.sql));
    const audit = calls.find((c) => /^INSERT INTO audit_events/i.test(c.sql));
    assert.ok(rollback, 'first transaction should ROLLBACK on order insert failure');
    assert.ok(audit, 'failure audit event should still be written in a fresh tenant tx');

    const [, , action, , , statusCode, result, errorCode] = audit.params;
    assert.equal(action, 'order.create.failed');
    assert.equal(statusCode, 500);
    assert.equal(result, 'failure');
    assert.equal(errorCode, 'internal_error');
  } finally {
    server.close();
  }
});

test('POST /order writes kinesis_publish_failed audit row when publisher returns ok=false', async () => {
  const { pool, calls } = makeRecordingPool();
  const publishOrderEvent = async () => ({ ok: false, error: 'transport down' });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared',
    rateLimitMax: 1000,
    publishOrderEvent,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme' },
      body: validBody,
    });
    assert.equal(res.status, 201);
    // First audit row is order.create success; second is the kinesis fallback.
    const audits = calls.filter((c) => /^INSERT INTO audit_events/i.test(c.sql));
    assert.equal(audits.length, 2, 'expected success + kinesis_publish_failed audit rows');
    const [, , action, , , , result, errorCode] = audits[1].params;
    assert.equal(action, 'order.created');
    assert.equal(result, 'kinesis_publish_failed');
    assert.equal(errorCode, 'transport down');
  } finally {
    server.close();
  }
});

test('POST /order swallows publisher throw and still returns 201', async () => {
  const { pool } = makeRecordingPool();
  const publishOrderEvent = async () => { throw new Error('boom'); };
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey: 'shared',
    rateLimitMax: 1000,
    publishOrderEvent,
  });
  const server = await new Promise((r) => {
    const s = app.listen(0, '127.0.0.1', () => r(s));
  });
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const res = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared', 'X-Tenant-Id': 'acme' },
      body: validBody,
    });
    assert.equal(res.status, 201);
  } finally {
    server.close();
  }
});
