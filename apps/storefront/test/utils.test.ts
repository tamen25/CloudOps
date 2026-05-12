import test from "node:test";
import assert from "node:assert/strict";
import { cn } from "../src/lib/utils";

test("cn joins strings + dedupes Tailwind classes", () => {
  assert.equal(cn("px-4", "px-2"), "px-2");
  assert.equal(cn("text-fg-base", undefined, "text-fg-base"), "text-fg-base");
  assert.equal(cn("p-2", { "bg-bg-elev": true, "bg-danger": false }), "p-2 bg-bg-elev");
});

test("cn returns empty string when given falsy inputs", () => {
  assert.equal(cn(), "");
  assert.equal(cn(undefined, null, false), "");
});
