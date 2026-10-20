// search-gateway signs a tenant's search to order-api and caches good
// answers per tenant. fetch is replaced; the signing secret comes from the
// environment (no SSM parameter), so nothing leaves the process.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "..");

let n = 0;
// upstream(request) returns { status, body } or throws.
async function load(upstream) {
  const requests = [];
  Object.assign(process.env, { ORDER_API_INTERNAL_URL: "http://order-api.test", INTERNAL_HMAC_SECRET: "s3cret" });
  delete process.env.HMAC_SECRET_PARAMETER_NAME;
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    const r = await upstream({ url, init });
    return { status: r.status, text: async () => (typeof r.body === "string" ? r.body : JSON.stringify(r.body)) };
  };
  const { handler } = await import(`${pathToFileURL(path.join(DIR, "index.mjs"))}?v=${n++}`);
  return { handler, requests };
}

const search = (q, tenant = "t1") => ({
  routeKey: "GET /search",
  queryStringParameters: { q },
  requestContext: { authorizer: { jwt: { claims: tenant ? { "custom:tenant_id": tenant } : {} } } },
});
const ok = () => ({ status: 200, body: { results: [{ id: 1 }] } });

test("a search is signed the way order-api verifies it", async () => {
  const { handler, requests } = await load(ok);
  assert.equal((await handler(search("boots"))).statusCode, 200);
  const h = requests[0].init.headers;
  const expected = createHash("sha256")
    .update(`${h["x-cloudops-timestamp"]}.t1.${requests[0].init.body}.s3cret`).digest("hex");
  assert.equal(h["x-cloudops-hmac"], expected);
  assert.equal(h["x-cloudops-tenant"], "t1");
  assert.equal(requests[0].url, "http://order-api.test/_internal/search");
});

test("answers are cached per tenant, and failures are not cached", async () => {
  let status = 500;
  const { handler, requests } = await load(() => ({ status, body: { error: "boom" } }));
  assert.equal((await handler(search("boots"))).statusCode, 500);
  status = 200;
  assert.equal((await handler(search("boots"))).headers["x-cache"], "MISS");
  assert.equal((await handler(search("boots"))).headers["x-cache"], "HIT");
  assert.equal((await handler(search("boots", "t2"))).headers["x-cache"], "MISS");
  assert.equal(requests.length, 3);
});

// A non-JSON 200 used to be cached and served as a 200, with up to 256
// characters of the upstream body in it.
test("an upstream body that is not JSON is a 502, uncached, and not echoed", async () => {
  const { handler, requests } = await load(() => ({ status: 200, body: "<html>stack trace at db.internal:5432</html>" }));
  const first = await handler(search("boots"));
  assert.equal(first.statusCode, 502);
  assert.doesNotMatch(first.body, /db\.internal/);
  await handler(search("boots"));
  assert.equal(requests.length, 2, "the failure was cached");
});

test("an upstream that does not answer in time is a 504", async () => {
  const { handler } = await load(() => { const e = new Error("timed out"); e.name = "TimeoutError"; throw e; });
  assert.equal((await handler(search("boots"))).statusCode, 504);
});

test("no tenant is a 401 and a bad query a 400, before any upstream call", async () => {
  const { handler, requests } = await load(ok);
  assert.equal((await handler(search("boots", null))).statusCode, 401);
  assert.equal((await handler(search(""))).statusCode, 400);
  assert.equal((await handler(search("x".repeat(201)))).statusCode, 400);
  assert.equal(requests.length, 0);
});
