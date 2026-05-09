// This file contains auth JWT test logic for order API test.
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const { generateKeyPair, exportJWK, SignJWT } = require('jose');

const { createApp } = require('../src/app');
const { createJwtVerifier, hasAllScopes, parseScopes } = require('../src/auth-jwt');

// ── Helpers ──────────────────────────────────────────────────────────────────

function silentLogger() {
  return { info() {}, warn() {}, error() {} };
}

// Stand up a minimal JWKS HTTP server so jose's createRemoteJWKSet has
// something concrete to fetch. Returns { jwksUrl, close }.
async function startJwks(jwk) {
  const body = JSON.stringify({ keys: [jwk] });
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(body);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    jwksUrl: `http://127.0.0.1:${port}/.well-known/jwks.json`,
    close: () => new Promise((r) => server.close(r)),
  };
}

// Handles new signer.
async function newSigner({ issuer, audience, kid = 'test-key' }) {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = kid;
  jwk.alg = 'RS256';
  jwk.use = 'sig';

  return {
    jwk,
    sign: async (claims = {}, opts = {}) => {
      const now = Math.floor(Date.now() / 1000);
      const builder = new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'RS256', kid })
        .setIssuer(opts.issuer ?? issuer)
        .setAudience(opts.audience ?? audience)
        .setIssuedAt(now)
        .setExpirationTime(opts.exp ?? now + 300);
      if (opts.notBefore) builder.setNotBefore(opts.notBefore);
      return builder.sign(privateKey);
    },
  };
}

// Handles start app.
async function startApp({ issuer, audience, jwksUrl, requiredScopes = [], apiKey = '' }) {
  const pool = { query: async () => ({ rows: [{ order_id: 'ok' }], rowCount: 1 }) };
  const jwtVerifier = createJwtVerifier({
    issuer,
    audience,
    jwksUrl,
    requiredScopes,
    logger: silentLogger(),
    // Disable jose's cooldown so back-to-back tests can refetch on kid miss.
    jwksOptions: { cooldownDuration: 0 },
  });
  const { app } = createApp({
    pool,
    logger: silentLogger(),
    nodeEnv: 'test',
    apiKey,
    jwtVerifier,
    rateLimitMax: 1000,
  });
  return new Promise((r) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      r({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

// Handles stop server.
function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

const validBody = JSON.stringify({ items: [{ sku: 'a', quantity: 1 }], total: 1 });

// ── Tests ───────────────────────────────────────────────────────────────────

test('JWT helpers parse scope claims and enforce required scopes', () => {
  assert.deepEqual([...parseScopes({ scp: ['order:read', 'order:write'] })], ['order:read', 'order:write']);
  assert.deepEqual([...parseScopes({ scope: 'order:read order:write' })], ['order:read', 'order:write']);
  assert.equal(hasAllScopes(new Set(['order:read', 'order:write']), new Set(['order:write'])), true);
  assert.equal(hasAllScopes(new Set(['order:read']), new Set(['order:write'])), false);
});

test('createJwtVerifier rejects incomplete OIDC configuration', () => {
  assert.throws(() => createJwtVerifier({ issuer: 'issuer', audience: 'audience' }), /requires issuer/);
});

test('valid JWT with matching iss + aud + tenant_id passes', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({ issuer, audience, jwksUrl: jwks.jwksUrl });

  try {
    const token = await signer.sign({ sub: 'user-1', tenant_id: 'acme' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 201);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('valid JWT with required scope passes', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({
    issuer, audience, jwksUrl: jwks.jwksUrl, requiredScopes: ['order:write'],
  });

  try {
    const token = await signer.sign({ sub: 'user-1', tenant_id: 'acme', scope: 'order:read order:write' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 201);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('valid JWT WITHOUT tenant_id is rejected with 400 invalid_tenant (closes backlog #8)', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({ issuer, audience, jwksUrl: jwks.jwksUrl });

  try {
    const token = await signer.sign({ sub: 'user-1' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 400);
    const body = await r.json();
    assert.equal(body.error, 'invalid_tenant');
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('JWT signed by a different key is rejected (kid not in JWKS)', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const trusted = await newSigner({ issuer, audience, kid: 'trusted' });
  const attacker = await newSigner({ issuer, audience, kid: 'attacker' });
  const jwks = await startJwks(trusted.jwk); // only trusted is in the JWKS
  const { server, baseUrl } = await startApp({ issuer, audience, jwksUrl: jwks.jwksUrl });

  try {
    const token = await attacker.sign({ sub: 'evil' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 401);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('JWT with wrong issuer is rejected', async () => {
  const audience = 'order-api';
  const signer = await newSigner({ issuer: 'https://issuer.test/realms/cloudops', audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({
    issuer: 'https://OTHER.test/realms/cloudops',
    audience,
    jwksUrl: jwks.jwksUrl,
  });

  try {
    const token = await signer.sign({ sub: 'user-1' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 401);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('JWT missing required scope returns 403', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({
    issuer, audience, jwksUrl: jwks.jwksUrl, requiredScopes: ['order:write'],
  });

  try {
    const token = await signer.sign({ sub: 'user-1', scope: 'order:read' });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 403);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('expired JWT is rejected', async () => {
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({ issuer, audience, jwksUrl: jwks.jwksUrl });

  try {
    const past = Math.floor(Date.now() / 1000) - 60;
    const token = await signer.sign({ sub: 'user-1' }, { exp: past });
    const r = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: validBody,
    });
    assert.equal(r.status, 401);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});

test('no Bearer header falls through to API-key path', async () => {
  // With apiKey set, no JWT means API-key check kicks in.
  const issuer = 'https://issuer.test/realms/cloudops';
  const audience = 'order-api';
  const signer = await newSigner({ issuer, audience });
  const jwks = await startJwks(signer.jwk);
  const { server, baseUrl } = await startApp({
    issuer, audience, jwksUrl: jwks.jwksUrl, apiKey: 'shared-secret',
  });

  try {
    const without = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: validBody,
    });
    assert.equal(without.status, 401, 'no auth should be 401 when apiKey is set');

    const withKey = await fetch(`${baseUrl}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': 'shared-secret' },
      body: validBody,
    });
    assert.equal(withKey.status, 201);
  } finally {
    await stopServer(server);
    await jwks.close();
  }
});
