// Tests for the api-gateway Express app. Mirrors order-api's idiom:
// app.listen(0) on loopback, raw fetch against the assigned port.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';

function silentLogger() {
  return { info() {}, error() {} };
}

async function startServer(deps: Parameters<typeof createApp>[0]) {
  const app = createApp(deps);
  return new Promise<{ server: import('http').Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

test('GET /healthz returns 200 ok', async () => {
  const { server, baseUrl } = await startServer({ pricingUrl: 'http://unused', logger: silentLogger() });
  try {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
  } finally {
    server.close();
  }
});

test('GET /readyz returns 200 ready', async () => {
  const { server, baseUrl } = await startServer({ pricingUrl: 'http://unused', logger: silentLogger() });
  try {
    const res = await fetch(`${baseUrl}/readyz`);
    assert.equal(res.status, 200);
  } finally {
    server.close();
  }
});

test('POST /v1/order fans out to pricing and returns the quote', async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ total_cents: 200, lines: [{ sku: 'A', price_cents: 100, qty: 2 }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

  const { server, baseUrl } = await startServer({ pricingUrl: 'http://pricing', logger: silentLogger(), fetchImpl: fakeFetch });
  try {
    const res = await fetch(`${baseUrl}/v1/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ sku: 'A', price_cents: 100, qty: 2 }] }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.total_cents, 200);
  } finally {
    server.close();
  }
});

test('POST /v1/order returns 502 when pricing is unreachable', async () => {
  const failFetch = (async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;

  const { server, baseUrl } = await startServer({ pricingUrl: 'http://pricing', logger: silentLogger(), fetchImpl: failFetch });
  try {
    const res = await fetch(`${baseUrl}/v1/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});

test('POST /v1/order returns 502 when pricing responds non-2xx', async () => {
  const errFetch = (async () => new Response('upstream error', { status: 500 })) as unknown as typeof fetch;

  const { server, baseUrl } = await startServer({ pricingUrl: 'http://pricing', logger: silentLogger(), fetchImpl: errFetch });
  try {
    const res = await fetch(`${baseUrl}/v1/order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'pricing_failed');
  } finally {
    server.close();
  }
});
