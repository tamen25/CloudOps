// Applies every migration to a real Postgres, as a non-superuser owner the
// way the RDS master is, so FORCE RLS applies exactly as it does in AWS. The
// other migration tests use a fake client and never run the SQL.
//
// Runs when MIGRATIONS_PG_URL points at a server where that URL's user may
// create roles and databases (CI starts one; app.yml `test` job). Skipped
// otherwise, e.g.:
//   docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=pw postgres:15
//   MIGRATIONS_PG_URL=postgres://postgres:pw@localhost:5432/postgres npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { runMigrations } from '../src/migrations';

const adminUrl = process.env.MIGRATIONS_PG_URL ?? '';
const logger = { info() {}, error() {} };

test('migrations apply to Postgres as a non-superuser owner, and the integration-test product is priced for its tenant only', { skip: adminUrl === '' && 'MIGRATIONS_PG_URL not set' }, async () => {
  const suffix = randomBytes(4).toString('hex');
  const role = `migrator_${suffix}`;
  const database = `migrations_${suffix}`;
  const password = randomBytes(12).toString('hex');

  const admin = new Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE ROLE ${role} LOGIN CREATEROLE PASSWORD '${password}'`);
  await admin.query(`CREATE DATABASE ${database} OWNER ${role}`);

  const url = new URL(adminUrl);
  url.username = role;
  url.password = password;
  url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1 });
  // The pool emits 'error' only for idle connections. The one expected here
  // is DROP DATABASE ... WITH (FORCE) below ending a connection the pool
  // has not finished closing; without a listener it is an uncaught
  // exception. A failing query still rejects, and fails the test.
  pool.on('error', () => {});

  try {
    await runMigrations({ pool, logger });
    // A second run finds nothing pending and changes nothing.
    await runMigrations({ pool, logger });

    const priceFor = async (tenant: string) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant]);
        const res = await client.query("SELECT price_cents FROM products WHERE sku = 'it-widget' AND is_active");
        await client.query('COMMIT');
        return res.rows.map((r) => Number(r.price_cents));
      } finally {
        client.release();
      }
    };

    // app.yml posts {"sku":"it-widget","quantity":1} with total 9.99.
    assert.deepEqual(await priceFor('integration-test'), [999]);
    assert.deepEqual(await priceFor('another-tenant'), []);
  } finally {
    await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS ${database} WITH (FORCE)`);
    await admin.query(`DROP ROLE IF EXISTS ${role}`);
    await admin.end();
  }
});
