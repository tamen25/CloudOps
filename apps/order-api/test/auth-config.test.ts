import test from 'node:test';
import assert from 'node:assert/strict';
import { assertAuthConfigured, UNAUTHENTICATED_ENVS } from '../src/auth-config';

// Creates logger.
function createLogger() {
  const calls = { warn: [] };
  return {
    info() {},
    // Handles warn.
    warn(...args) { calls.warn.push(args); },
    error() {},
    calls,
  };
}

test('assertAuthConfigured allows local/test envs without an apiKey (warns only)', () => {
  for (const nodeEnv of ['test', 'local']) {
    const logger = createLogger();
    assertAuthConfigured({ apiKey: '', nodeEnv, logger });
    assert.equal(logger.calls.warn.length, 1, `expected warn in ${nodeEnv}`);
  }
});

test('assertAuthConfigured throws in deployed envs (dev, staging, prod) when no auth is configured', () => {
  // Backlog #50 — dev must not deploy unauthenticated; only `test`/`local`
  // (unit/integration runners) keep the open path.
  for (const nodeEnv of ['dev', 'staging', 'prod']) {
    assert.throws(
      () => assertAuthConfigured({ apiKey: '', nodeEnv, logger: createLogger() }),
      /auth config required/,
      `expected throw in ${nodeEnv}`,
    );
  }
});

test('assertAuthConfigured passes silently when apiKey is set, regardless of env', () => {
  for (const nodeEnv of ['dev', 'staging', 'prod', 'test']) {
    const logger = createLogger();
    assertAuthConfigured({ apiKey: 'secret', nodeEnv, logger });
    assert.equal(logger.calls.warn.length, 0, `expected no warn in ${nodeEnv}`);
  }
});

test('assertAuthConfigured accepts a JWT verifier as the auth path (backlog #7)', () => {
  for (const nodeEnv of ['staging', 'prod']) {
    const logger = createLogger();
    // jwtVerifier need only be truthy — server.ts builds it from createJwtVerifier.
    assertAuthConfigured({ apiKey: '', jwtVerifier: () => {}, nodeEnv, logger });
    assert.equal(logger.calls.warn.length, 0, `expected no warn in ${nodeEnv} with jwtVerifier`);
  }
});

test('UNAUTHENTICATED_ENVS only allows local test runners', () => {
  assert.deepEqual([...UNAUTHENTICATED_ENVS].sort(), ['local', 'test']);
});
