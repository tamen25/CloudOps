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

// Forwards trace/synthetic/tenant headers — exercises the truthy branch of the
// downstreamHeaders forwarding loop (each header present and non-empty).
test('forwards trace + synthetic + tenant headers to downstreams', async () => {
  const seen: Record<string, string | null> = {};
  const capturing = (async (url: string, init: RequestInit) => {
    const h = init.headers as Record<string, string>;
    if (url.includes('/quote')) {
      seen.traceparent = h.traceparent ?? null;
      seen['x-synthetic'] = h['x-synthetic'] ?? null;
      seen['x-tenant-id'] = h['x-tenant-id'] ?? null;
    }
    return new Response(JSON.stringify({ total_cents: 200 }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  const app = createApp({ ...URLS, logger: silentLogger(), fetchImpl: capturing });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/order`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        traceparent: '00-abc-def-01',
        'x-synthetic': '1',
        'x-tenant-id': 'synthetic-load',
      },
      body: JSON.stringify({ items: [] }),
    });
    // pricing returns 200 with no /reserve stub -> 404 -> 409 out_of_stock, but
    // the assertion is on what pricing *received*.
    assert.ok(res.status === 200 || res.status === 409 || res.status === 502);
    assert.equal(seen.traceparent, '00-abc-def-01');
    assert.equal(seen['x-synthetic'], '1');
    assert.equal(seen['x-tenant-id'], 'synthetic-load');
  } finally {
    server.close();
  }
});

// Non-JSON downstream body — exercises the catch in callHop (body -> null) and
// the `total_cents ?? 0` nullish fallback when pricing returns no parseable body.
test('non-JSON pricing body falls back to total_cents 0 and still chains', async () => {
  const nonJson = (async (url: string) => {
    if (url.includes('/quote')) {
      return new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    if (url.includes('/reserve')) return new Response(JSON.stringify({ reserved: true }), { status: 200 });
    if (url.includes('/score')) return new Response(JSON.stringify({ decision: 'approve' }), { status: 200 });
    return new Response(JSON.stringify({ auth_id: 'a', entry_id: 'e' }), { status: 200 });
  }) as unknown as typeof fetch;
  const { server, baseUrl } = await startServer(nonJson);
  try {
    const res = await placeOrder(baseUrl, { items: [] });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).total_cents, 0);
  } finally {
    server.close();
  }
});

// Fraud hop errors (non-ok) — exercises the `fraud.ok &&` false branch (a 5xx
// fraud response is treated as fail-open, not a deny) and `decision ?? 'unknown'`.
test('fraud hop 500 is fail-open and decision defaults to unknown', async () => {
  const { server, baseUrl } = await startServer(
    routingFetch({ '/score': { status: 500, body: {} } }),
  );
  try {
    const res = await placeOrder(baseUrl, { items: [{ sku: 'A', qty: 1 }] });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).fraud_decision, 'unknown');
  } finally {
    server.close();
  }
});
