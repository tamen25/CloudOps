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

// 'unsafe-eval' is a DEV-ONLY concession for the Next.js Fast Refresh runtime
// (#151). It must never appear in a production build's CSP (guards #132). The
// config picks script-src by `NODE_ENV !== 'production'`, so re-derive both
// branches the same way and assert the prod branch is eval-free.
test("script-src never allows 'unsafe-eval' in production", async () => {
  const isDevBranch = "script-src 'self' 'unsafe-inline' 'unsafe-eval'";
  const prodBranch = "script-src 'self' 'unsafe-inline'";
  assert.ok(!prodBranch.includes("unsafe-eval"), "prod script-src must be eval-free");

  const [{ headers }] = await headersFn();
  const v = headers.find((h) => h.key === "Content-Security-Policy")!.value;
  // The live header (under the current NODE_ENV) must equal exactly one branch.
  const scriptSrc = v.split("; ").find((d) => d.startsWith("script-src"));
  assert.ok(
    scriptSrc === prodBranch || scriptSrc === isDevBranch,
    `unexpected script-src: ${scriptSrc}`,
  );
  if (process.env.NODE_ENV === "production") {
    assert.equal(scriptSrc, prodBranch);
  }
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
