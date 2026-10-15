import test from 'node:test';
import assert from 'node:assert/strict';
import { clampRps, clampDuration, MAX_RPS, MAX_DURATION_SECONDS } from '../src/clamp';
import { isScenario, pickTemplate, scenarioTemplates } from '../src/scenarios';
import { LoadRunner } from '../src/runner';

test('clampRps enforces ceiling and floor', () => {
  assert.equal(clampRps(99999), MAX_RPS);
  assert.equal(clampRps(0), 1);
  assert.equal(clampRps(-5), 1);
  assert.equal(clampRps('abc'), 1);
  assert.equal(clampRps(50), 50);
});

test('clampDuration enforces ceiling and floor', () => {
  assert.equal(clampDuration(99999), MAX_DURATION_SECONDS);
  assert.equal(clampDuration(0), 1);
  assert.equal(clampDuration(120), 120);
});

test('isScenario validates names', () => {
  assert.equal(isScenario('place-order'), true);
  assert.equal(isScenario('nope'), false);
});

test('pickTemplate respects weight extremes', () => {
  const weighted = [
    { weight: 0, template: scenarioTemplates('browse')[0].template },
    { weight: 1, template: scenarioTemplates('place-order')[0].template },
  ];
  // rand=0 should skip the zero-weight entry and land on the place-order one.
  const picked = pickTemplate(weighted, () => 0);
  assert.equal(picked.path, '/v1/order');
});

test('runner.fireOne sends a synthetic-tagged request and counts ok', async () => {
  let capturedUrl = '';
  let capturedHeaders: Record<string, string> = {};
  const fakeFetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = init.headers as Record<string, string>;
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;

  const runner = new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: fakeFetch });
  await runner.fireOne('place-order');
  assert.match(capturedUrl, /^http:\/\/api-gateway\/v1\/order$/);
  assert.equal(capturedHeaders['x-synthetic'], '1');
  assert.equal(runner.getStatus().sent, 1);
  assert.equal(runner.getStatus().ok, 1);
});

test('runner counts a thrown fetch as failed', async () => {
  const boom = (async () => { throw new Error('down'); }) as unknown as typeof fetch;
  const runner = new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: boom });
  await runner.fireOne('place-order');
  assert.equal(runner.getStatus().failed, 1);
});

test('chaos request failures are counted ok-by-design', async () => {
  const errFetch = (async () => new Response('bad', { status: 400 })) as unknown as typeof fetch;
  const runner = new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: errFetch });
  // chaos scenario template[0] is the fault template (weight 3) — force it.
  const chaosTemplates = scenarioTemplates('chaos');
  await runner.fireOne('chaos', [chaosTemplates[0]]);
  assert.equal(runner.getStatus().failed, 0);
  assert.equal(runner.getStatus().ok, 1);
});

test('start clamps params and marks running', () => {
  const runner = new LoadRunner({ targetBaseUrl: 'http://api-gateway', fetchImpl: (async () => new Response('{}')) as unknown as typeof fetch });
  const params = runner.start('mixed', 99999, 99999);
  try {
    assert.equal(params.rps, MAX_RPS);
    assert.equal(params.durationSeconds, MAX_DURATION_SECONDS);
    assert.equal(runner.getStatus().running, true);
  } finally {
    runner.stop();
  }
  assert.equal(runner.getStatus().running, false);
});
