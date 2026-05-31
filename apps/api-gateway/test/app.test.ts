// Tests for the api-gateway deep-chain orchestration. A routing fake-fetch
// dispatches by URL path so each hop can be stubbed independently.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';

function silentLogger() {
  return { info() {}, error() {} };
}

const URLS = {
  pricingUrl: 'http://pricing',
  inventoryUrl: 'http://inventory',
  fraudUrl: 'http://fraud',
  paymentUrl: 'http://payment',
};

// Build a fetch that returns canned responses keyed by a substring of the URL.
// `overrides` lets a test change one hop's response.
function routingFetch(overrides: Record<string, { status: number; body: unknown }> = {}) {
  const defaults: Record<string, { status: number; body: unknown }> = {
    '/quote': { status: 200, body: { total_cents: 200, lines: [] } },
    '/reserve': { status: 200, body: { reserved: true, lines: [] } },
    '/score': { status: 200, body: { score: 10, decision: 'approve' } },
    '/authorize': { status: 200, body: { status: 'authorized', auth_id: 'a1', entry_id: 'e1' } },
  };
  const table = { ...defaults, ...overrides };
  return (async (url: string) => {
    const key = Object.keys(table).find((k) => url.includes(k));
    const r = key ? table[key] : { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

async function startServer(fetchImpl: typeof fetch) {
  const app = createApp({ ...URLS, logger: silentLogger(), fetchImpl });
  return new Promise<{ server: import('http').Server; baseUrl: string }>((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function placeOrder(baseUrl: string, body: unknown) {
  return fetch(`${baseUrl}/v1/order`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('GET /healthz returns 200 ok', async () => {
  const { server, baseUrl } = await startServer(routingFetch());
  try {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'ok');
  } finally {
    server.close();
  }
});

test('full chain success returns placed + all hops ok', async () => {
  const { server, baseUrl } = await startServer(routingFetch());
  try {
    const res = await placeOrder(baseUrl, { items: [{ sku: 'A', price_cents: 100, qty: 2 }], tenant_id: 't1' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'placed');
    assert.equal(body.total_cents, 200);
    assert.equal(body.auth_id, 'a1');
    assert.equal(body.entry_id, 'e1');
    assert.deepEqual(Object.keys(body.hops).sort(), ['fraud', 'inventory', 'payment', 'pricing']);
  } finally {
    server.close();
  }
});

test('pricing failure short-circuits with 502', async () => {
  const { server, baseUrl } = await startServer(routingFetch({ '/quote': { status: 500, body: {} } }));
  try {
    const res = await placeOrder(baseUrl, { items: [] });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'pricing_failed');
  } finally {
    server.close();
  }
});

test('out of stock returns 409 and does not reach payment', async () => {
  const { server, baseUrl } = await startServer(routingFetch({ '/reserve': { status: 200, body: { reserved: false, lines: [] } } }));
  try {
    const res = await placeOrder(baseUrl, { items: [{ sku: 'A', qty: 99 }] });
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error, 'out_of_stock');
    assert.equal(body.hops.payment, undefined);
  } finally {
    server.close();
  }
});

test('fraud deny returns 403', async () => {
  const { server, baseUrl } = await startServer(routingFetch({ '/score': { status: 200, body: { score: 90, decision: 'deny' } } }));
  try {
    const res = await placeOrder(baseUrl, { items: [{ sku: 'A', qty: 1 }] });
    assert.equal(res.status, 403);
    assert.equal((await res.json()).error, 'fraud_denied');
  } finally {
    server.close();
  }
});

test('payment failure returns 402', async () => {
  const { server, baseUrl } = await startServer(routingFetch({ '/authorize': { status: 402, body: { status: 'declined' } } }));
  try {
    const res = await placeOrder(baseUrl, { items: [{ sku: 'A', qty: 1 }] });
    assert.equal(res.status, 402);
    assert.equal((await res.json()).error, 'payment_failed');
  } finally {
    server.close();
  }
});

test('thrown fetch yields 502 upstream_unavailable', async () => {
  const boom = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
  const { server, baseUrl } = await startServer(boom);
  try {
    const res = await placeOrder(baseUrl, { items: [] });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error, 'upstream_unavailable');
  } finally {
    server.close();
  }
});
