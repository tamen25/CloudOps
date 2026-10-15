import test from "node:test";
import assert from "node:assert/strict";
import {
  ExponentialBackoffTracker,
  FixedWindowRateLimiter,
  getClientIpFromHeaders,
} from "../src/lib/rate-limit";

test("client IP resolution uses the ALB-appended right-most XFF hop", () => {
  const headers = new Headers({
    "x-forwarded-for": "198.51.100.1, 203.0.113.7",
  });
  assert.equal(getClientIpFromHeaders(headers), "203.0.113.7");
});

test("fixed-window limiter blocks after the configured budget and resets", () => {
  const limiter = new FixedWindowRateLimiter(60_000, 2);
  assert.equal(limiter.consume("ip:1", 1_000).allowed, true);
  assert.equal(limiter.consume("ip:1", 2_000).allowed, true);
  const blocked = limiter.consume("ip:1", 3_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 58);
  assert.equal(limiter.consume("ip:1", 61_001).allowed, true);
});

test("auth backoff doubles delay, caps it, and clears on success", () => {
  const tracker = new ExponentialBackoffTracker(1_000, 4_000, 15 * 60_000);
  assert.equal(tracker.fail("ip:1", 0), 1);
  assert.equal(tracker.check("ip:1", 500), 1);
  assert.equal(tracker.fail("ip:1", 1_000), 2);
  assert.equal(tracker.fail("ip:1", 2_000), 4);
  assert.equal(tracker.fail("ip:1", 3_000), 4, "delay is capped");
  tracker.success("ip:1");
  assert.equal(tracker.check("ip:1", 3_001), 0);
});
