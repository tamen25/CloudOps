import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp, type ControlDeps } from '../src/app';
import { LoadRunner } from '../src/runner';
import { computeHmac } from '../src/hmac';
import { ChaosController, type PodClient, type PodInfo } from '../src/chaos';

const SECRET = 'loadgen-secret';

function makeRunner() {
  // A no-op fetch so start() doesn't fire real traffic during tests.
  const noopFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  return new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: noopFetch });
}

async function startServer(runner: LoadRunner, extra: Partial<ControlDeps> = {}) {
  const app = createApp({ runner, hmacSecret: SECRET, ...extra });
  return new Promise<{ server: import('http').Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// A ChaosController wired to an in-memory pod list, used to assert the endpoint
// wiring (HMAC, dry-run default, allowlist) without a live cluster.
function makeChaos(pods: PodInfo[]): { chaos: ChaosController; deleted: string[] } {
  const deleted: string[] = [];
  const client: PodClient = {
    async listPods(ns, sel) {
      const want = sel.split('=')[1];
      return pods.filter((p) => p.namespace === ns && p.labels.app === want);
    },
    async deletePod(ns, name) {
      deleted.push(`${ns}/${name}`);
    },
  };
  return {
    chaos: new ChaosController({ client, namespace: 'cloudops', logger: { info() {}, error() {} } }),
    deleted,
  };
}

function signedHeaders(body: string, tenant = 'ops') {
  const ts = String(Date.now());
  return {
    'content-type': 'application/json',
    'x-cloudops-timestamp': ts,
    'x-cloudops-tenant': tenant,
    'x-cloudops-hmac': computeHmac(ts, tenant, body, SECRET),
  };
}

test('GET /status is open and reports not-running', async () => {
  const { server, baseUrl } = await startServer(makeRunner());
  try {
    const res = await fetch(`${baseUrl}/status`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).running, false);
  } finally {
    server.close();
  }
});

test('POST /run requires HMAC', async () => {
  const { server, baseUrl } = await startServer(makeRunner());
  try {
    const res = await fetch(`${baseUrl}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: 'mixed', rps: 5, durationSeconds: 2 }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /run with valid HMAC starts a clamped run', async () => {
  const runner = makeRunner();
  const { server, baseUrl } = await startServer(runner);
  try {
    const body = JSON.stringify({ scenario: 'mixed', rps: 99999, durationSeconds: 2 });
    const res = await fetch(`${baseUrl}/run`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 202);
    const json = await res.json();
    assert.equal(json.scenario, 'mixed');
    assert.equal(json.rps, 200); // clamped to MAX_RPS
  } finally {
    runner.stop();
    server.close();
  }
});

test('POST /run rejects an unknown scenario', async () => {
  const { server, baseUrl } = await startServer(makeRunner());
  try {
    const body = JSON.stringify({ scenario: 'evil', rps: 5, durationSeconds: 2 });
    const res = await fetch(`${baseUrl}/run`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'invalid_scenario');
  } finally {
    server.close();
  }
});

test('POST /run cannot specify a target URL (SSRF guard is structural)', async () => {
  // Even if a caller sends a "target"/"url" field, the runner ignores it — the
  // target is fixed at construction. Assert the body field has no effect.
  const runner = makeRunner();
  const { server, baseUrl } = await startServer(runner);
  try {
    const body = JSON.stringify({ scenario: 'browse', rps: 1, durationSeconds: 1, target: 'http://169.254.169.254/' });
    const res = await fetch(`${baseUrl}/run`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 202);
    // No 'target' echoed back; runner still points at the fixed gateway.
    const json = await res.json();
    assert.equal(json.target, undefined);
  } finally {
    runner.stop();
    server.close();
  }
});

test('POST /stop with valid HMAC stops the run', async () => {
  const runner = makeRunner();
  const { server, baseUrl } = await startServer(runner);
  try {
    const startBody = JSON.stringify({ scenario: 'mixed', rps: 5, durationSeconds: 10 });
    await fetch(`${baseUrl}/run`, { method: 'POST', headers: signedHeaders(startBody), body: startBody });
    const stopBody = JSON.stringify({});
    const res = await fetch(`${baseUrl}/stop`, { method: 'POST', headers: signedHeaders(stopBody), body: stopBody });
    assert.equal(res.status, 200);
    assert.equal(runner.getStatus().running, false);
  } finally {
    server.close();
  }
});

test('POST /chaos/kill is 404 when chaos is not enabled (no controller)', async () => {
  const { server, baseUrl } = await startServer(makeRunner()); // no chaos dep
  try {
    const body = JSON.stringify({ service: 'pricing', dryRun: false });
    const res = await fetch(`${baseUrl}/chaos/kill`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'chaos_disabled');
  } finally {
    server.close();
  }
});

test('POST /chaos/kill requires HMAC even when enabled', async () => {
  const { chaos } = makeChaos([{ name: 'pricing-1', namespace: 'cloudops', labels: { app: 'pricing' } }]);
  const { server, baseUrl } = await startServer(makeRunner(), { chaos });
  try {
    const res = await fetch(`${baseUrl}/chaos/kill`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service: 'pricing', dryRun: false }),
    });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('POST /chaos/kill defaults to dry-run (deletes nothing) when dryRun omitted', async () => {
  const { chaos, deleted } = makeChaos([{ name: 'pricing-1', namespace: 'cloudops', labels: { app: 'pricing' } }]);
  const { server, baseUrl } = await startServer(makeRunner(), { chaos });
  try {
    const body = JSON.stringify({ service: 'pricing' }); // no dryRun field
    const res = await fetch(`${baseUrl}/chaos/kill`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.dryRun, true);
    assert.equal(json.pod, 'pricing-1');
    assert.deepEqual(deleted, []);
  } finally {
    server.close();
  }
});

test('POST /chaos/kill with dryRun:false deletes exactly one mesh pod', async () => {
  const { chaos, deleted } = makeChaos([
    { name: 'fraud-1', namespace: 'cloudops', labels: { app: 'fraud' } },
    { name: 'fraud-2', namespace: 'cloudops', labels: { app: 'fraud' } },
  ]);
  const { server, baseUrl } = await startServer(makeRunner(), { chaos });
  try {
    const body = JSON.stringify({ service: 'fraud', dryRun: false });
    const res = await fetch(`${baseUrl}/chaos/kill`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.dryRun, false);
    assert.deepEqual(deleted, ['cloudops/fraud-1']);
  } finally {
    server.close();
  }
});

test('POST /chaos/kill rejects a non-allowlisted service with 400', async () => {
  const { chaos, deleted } = makeChaos([{ name: 'loadgen-self', namespace: 'cloudops', labels: { app: 'loadgen' } }]);
  const { server, baseUrl } = await startServer(makeRunner(), { chaos });
  try {
    const body = JSON.stringify({ service: 'loadgen', dryRun: false });
    const res = await fetch(`${baseUrl}/chaos/kill`, { method: 'POST', headers: signedHeaders(body), body });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).reason, 'service_not_killable');
    assert.deepEqual(deleted, []);
  } finally {
    server.close();
  }
});
