// Which BFF routes need the admin group. Route handlers need Next's request
// context, so this checks the source: every route that reads raw traces or
// drives the load generator calls requireAdmin(), and nothing else gates it.
// The traces route used to need only a session, so any signed-in shopper
// could list and read every tenant's spans.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const API = path.resolve(__dirname, "../src/app/api");
const ADMIN_ONLY = ["observe/traces", "load/run", "load/stop", "load/chaos"];

for (const route of ADMIN_ONLY) {
  test(`${route} requires the admin group`, () => {
    const src = readFileSync(path.join(API, route, "route.ts"), "utf8");
    assert.match(src, /const auth = await requireAdmin\(\);\s*if \(auth instanceof NextResponse\) return auth;/);
    assert.doesNotMatch(src, /requireSession\(/, "gated by session only");
  });
}
