import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { computeHmac } from '../src/hmac';

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

test('GET /healthz returns 200', async () => {
  const { server, baseUrl } = await startServer({ ledgerUrl: 'http://l', hmacSecret: 's', logger: silentLogger() });
  try {
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
  } finally {
    server.close();
  }
});

test('POST /authorize approves and posts a signed entry to ledger', async () => {
  let capturedHeaders: Headers | undefined;
  let capturedBody = '';
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    capturedHeaders = new Headers(init.headers as HeadersInit);
    capturedBody = String(init.body);
    return new Response(JSON.stringify({ entry_id: 'entry-1' }), { status: 200 });
  }) as unknown as typeof fetch;

  const { server, baseUrl } = await startServer({
    ledgerUrl: 'http://ledger',
    hmacSecret: 'topsecret',
    logger: silentLogger(),
    fetchImpl: fakeFetch,
    idGen: () => 'auth-fixed',
  });
  try {
    const res = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_cents: 500, tenant_id: 't1' }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'authorized');
    assert.equal(body.auth_id, 'auth-fixed');
    assert.equal(body.entry_id, 'entry-1');

    // The ledger call must carry a valid HMAC over the exact body sent.
    const ts = capturedHeaders!.get('x-cloudops-timestamp')!;
    const expected = computeHmac(ts, 't1', capturedBody, 'topsecret');
    assert.equal(capturedHeaders!.get('x-cloudops-hmac'), expected);
  } finally {
    server.close();
  }
});

test('POST /authorize rejects non-positive amount', async () => {
  const { server, baseUrl } = await startServer({ ledgerUrl: 'http://l', hmacSecret: 's', logger: silentLogger() });
  try {
    const res = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_cents: 0 }),
    });
    assert.equal(res.status, 400);
  } finally {
    server.close();
  }
});

test('POST /authorize declines above the ceiling without calling ledger', async () => {
  let called = false;
  const fakeFetch = (async () => { called = true; return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
  const { server, baseUrl } = await startServer({ ledgerUrl: 'http://l', hmacSecret: 's', logger: silentLogger(), fetchImpl: fakeFetch });
  try {
    const res = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_cents: 1000000 }),
    });
    assert.equal(res.status, 402);
    assert.equal(called, false);
  } finally {
    server.close();
  }
});

test('POST /authorize returns 502 when ledger fails', async () => {
  const failFetch = (async () => new Response('err', { status: 500 })) as unknown as typeof fetch;
  const { server, baseUrl } = await startServer({ ledgerUrl: 'http://l', hmacSecret: 's', logger: silentLogger(), fetchImpl: failFetch });
  try {
    const res = await fetch(`${baseUrl}/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount_cents: 500 }),
    });
    assert.equal(res.status, 502);
  } finally {
    server.close();
  }
});
