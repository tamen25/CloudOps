import test from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, renderHtml } from "./index.mjs";

test("escapeHtml neutralises angle brackets and quotes", () => {
  assert.equal(
    escapeHtml('</code><img src=x onerror="alert(1)">'),
    "&lt;/code&gt;&lt;img src=x onerror=&quot;alert(1)&quot;&gt;"
  );
  assert.equal(escapeHtml("&"), "&amp;");
  assert.equal(escapeHtml("'"), "&#39;");
});

test("escapeHtml coerces null / undefined to empty string", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
});

test("renderHtml escapes SKU and order_id, does not interpolate raw markup", () => {
  const html = renderHtml({
    order_id: "<script>alert(1)</script>",
    items: [
      { sku: '</code><a href="https://attacker">phish</a><code>', quantity: 2 },
    ],
    total: 19.99,
  });
  assert.ok(!html.includes("<script>alert(1)</script>"), "raw script must not appear");
  assert.ok(!html.includes('<a href="https://attacker">phish</a>'), "raw anchor must not appear");
  assert.ok(html.includes("&lt;script&gt;"), "order_id must be escaped");
  assert.ok(html.includes("&lt;/code&gt;"), "sku must be escaped");
});

test("renderHtml coerces non-numeric quantity to 0", () => {
  const html = renderHtml({
    order_id: "ORD-1",
    items: [{ sku: "book-1", quantity: "<script>" }],
    total: 0,
  });
  assert.ok(html.includes("× 0"), "non-numeric quantity must coerce to 0");
});
