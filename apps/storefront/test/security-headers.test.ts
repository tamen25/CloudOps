import test from "node:test";
import assert from "node:assert/strict";
import config from "../next.config";

const headersFn = config.headers!;

test("security headers cover every path", async () => {
  const groups = await headersFn();
  assert.equal(groups.length, 1);
  assert.equal(groups[0].source, "/:path*");
});

test("CSP locks down default + ancestors + base + form-action + objects", async () => {
  const [{ headers }] = await headersFn();
  const csp = headers.find((h) => h.key === "Content-Security-Policy");
  assert.ok(csp, "CSP header must be present");
  const v = csp!.value;
  assert.match(v, /default-src 'self'/);
  assert.match(v, /frame-ancestors 'none'/);
  assert.match(v, /base-uri 'self'/);
  assert.match(v, /form-action 'self'/);
  assert.match(v, /object-src 'none'/);
  assert.match(v, /upgrade-insecure-requests/);
});

test("HSTS is at least one year with subdomains", async () => {
  const [{ headers }] = await headersFn();
  const hsts = headers.find((h) => h.key === "Strict-Transport-Security");
  assert.ok(hsts);
  assert.match(hsts!.value, /max-age=31536000/);
  assert.match(hsts!.value, /includeSubDomains/);
});

test("clickjacking + sniffing + referrer headers present", async () => {
  const [{ headers }] = await headersFn();
  const byKey = Object.fromEntries(headers.map((h) => [h.key, h.value]));
  assert.equal(byKey["X-Frame-Options"], "DENY");
  assert.equal(byKey["X-Content-Type-Options"], "nosniff");
  assert.equal(byKey["Referrer-Policy"], "no-referrer");
  assert.equal(byKey["Cross-Origin-Resource-Policy"], "same-origin");
  assert.equal(byKey["Cross-Origin-Opener-Policy"], "same-origin");
});

test("Permissions-Policy disables sensors and payment", async () => {
  const [{ headers }] = await headersFn();
  const pp = headers.find((h) => h.key === "Permissions-Policy");
  assert.ok(pp);
  for (const feature of ["camera", "microphone", "geolocation", "payment"]) {
    assert.match(pp!.value, new RegExp(`${feature}=\\(\\)`));
  }
});
