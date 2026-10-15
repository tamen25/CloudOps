import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOrderPayload, SKU_RE } from '../src/app.js';

test('SKU_RE accepts the legitimate shape', () => {
  for (const sku of ['a', 'WIDGET-001', 'book-1', 'NEW-1', 'A.B_C-1', '1234567890123456789012345678901234567890123456789012345678901234']) {
    assert.ok(SKU_RE.test(sku), `should accept ${sku}`);
  }
});

test('SKU_RE rejects HTML-bearing payloads', () => {
  for (const sku of [
    '</code><script>alert(1)</script>',
    '<img src=x>',
    'a"b',
    "a'b",
    'a b', // space
    '', // empty
    'a'.repeat(65), // too long
  ]) {
    assert.ok(!SKU_RE.test(sku), `should reject ${JSON.stringify(sku)}`);
  }
});

test('validateOrderPayload rejects HTML in SKU', () => {
  const res = validateOrderPayload({
    items: [{ sku: '</code><img src=x onerror=alert(1)>', quantity: 1 }],
    total: 1,
  });
  assert.equal(res.ok, false);
  if (res.ok === false) assert.match(res.error, /sku must match/);
});

test('validateOrderPayload accepts a normal SKU', () => {
  const res = validateOrderPayload({
    items: [{ sku: 'book-1', quantity: 1 }],
    total: 1,
  });
  assert.equal(res.ok, true);
});
