import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { LoadRunner } from '../src/runner';
import { computeHmac } from '../src/hmac';

const SECRET = 'loadgen-secret';

function makeRunner() {
  // A no-op fetch so start() doesn't fire real traffic during tests.
  const noopFetch = (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
  return new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: noopFetch });
}

async function startServer(runner: LoadRunner) {
  const app = createApp({ runner, hmacSecret: SECRET });
  return new Promise<{ server: import('http').Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
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
