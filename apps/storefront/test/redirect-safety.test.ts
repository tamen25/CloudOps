import test from "node:test";
import assert from "node:assert/strict";
import { isSafeNextPath } from "../src/app/login/start/route";
import { KNOWN_ERROR_REASONS } from "../src/app/auth/callback/route";

test("isSafeNextPath accepts same-origin relative paths", () => {
  for (const p of ["/", "/products", "/cart", "/orders/abc-123", "/admin/upload"]) {
    assert.equal(isSafeNextPath(p), true, `should accept ${p}`);
  }
});

test("isSafeNextPath rejects protocol-relative URLs", () => {
  for (const p of ["//evil.com", "//evil.com/cognito-phish", "//127.0.0.1"]) {
    assert.equal(isSafeNextPath(p), false, `should reject ${p}`);
  }
});

test("isSafeNextPath rejects backslash-prefixed paths (Windows browsers)", () => {
  for (const p of ["/\\evil.com", "/\\evil.com/path"]) {
    assert.equal(isSafeNextPath(p), false, `should reject ${p}`);
  }
});

test("isSafeNextPath rejects absolute URLs and bare hostnames", () => {
  for (const p of ["https://evil.com", "evil.com", "javascript:alert(1)"]) {
    assert.equal(isSafeNextPath(p), false, `should reject ${p}`);
  }
});

test("isSafeNextPath rejects empty / null / non-strings", () => {
  assert.equal(isSafeNextPath(null), false);
  assert.equal(isSafeNextPath(undefined), false);
  assert.equal(isSafeNextPath(""), false);
});

test("KNOWN_ERROR_REASONS is a whitelist, not a free-form bucket", () => {
  assert.ok(KNOWN_ERROR_REASONS.has("token_exchange_failed"));
  assert.ok(KNOWN_ERROR_REASONS.has("state_mismatch"));
  assert.ok(!KNOWN_ERROR_REASONS.has("nonce reuse: actual_nonce=abc123"));
  assert.ok(!KNOWN_ERROR_REASONS.has(""));
});
