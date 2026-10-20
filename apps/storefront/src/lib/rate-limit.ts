import { NextResponse, type NextRequest } from "next/server";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

interface BackoffState {
  failures: number;
  blockedUntil: number;
  lastFailureAt: number;
}

// Keys tracked per limiter. Every distinct client IP or user adds one, so
// without a bound the maps grew for as long as the pod ran. Past the cap,
// expired entries are swept; if that is not enough, the oldest go (a Map
// iterates in insertion order), which at worst forgets a limit early.
export const MAX_TRACKED_KEYS = 50_000;

function bound<V>(map: Map<string, V>, expired: (v: V) => boolean): void {
  if (map.size <= MAX_TRACKED_KEYS) return;
  for (const [key, value] of map) {
    if (expired(value)) map.delete(key);
  }
  for (const key of map.keys()) {
    if (map.size <= MAX_TRACKED_KEYS) break;
    map.delete(key);
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export class FixedWindowRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);
    bound(this.buckets, (b) => b.resetAt <= now);

    const allowed = bucket.count <= this.max;
    return {
      allowed,
      remaining: Math.max(this.max - bucket.count, 0),
      retryAfterSeconds: allowed
        ? 0
        : Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      resetAt: bucket.resetAt,
    };
  }

  clear(): void {
    this.buckets.clear();
  }

  get size(): number {
    return this.buckets.size;
  }
}

export class ExponentialBackoffTracker {
  private readonly states = new Map<string, BackoffState>();

  constructor(
    private readonly baseDelayMs: number,
    private readonly maxDelayMs: number,
    private readonly resetAfterMs: number,
  ) {}

  check(key: string, now = Date.now()): number {
    const state = this.states.get(key);
    if (!state) return 0;
    if (now - state.lastFailureAt >= this.resetAfterMs) {
      this.states.delete(key);
      return 0;
    }
    if (state.blockedUntil <= now) return 0;
    return Math.max(1, Math.ceil((state.blockedUntil - now) / 1000));
  }

  fail(key: string, now = Date.now()): number {
    const current = this.states.get(key);
    const failures =
      current && now - current.lastFailureAt < this.resetAfterMs
        ? current.failures + 1
        : 1;
    const delayMs = Math.min(
      this.maxDelayMs,
      this.baseDelayMs * 2 ** Math.max(0, failures - 1),
    );
    this.states.set(key, {
      failures,
      blockedUntil: now + delayMs,
      lastFailureAt: now,
    });
    bound(this.states, (st) => now - st.lastFailureAt >= this.resetAfterMs);
    return Math.max(1, Math.ceil(delayMs / 1000));
  }

  success(key: string): void {
    this.states.delete(key);
  }

  clear(): void {
    this.states.clear();
  }

  get size(): number {
    return this.states.size;
  }
}

const API_WINDOW_MS = positiveInt(
  process.env.STOREFRONT_API_RATE_LIMIT_WINDOW_MS,
  60_000,
);
const API_IP_MAX = positiveInt(
  process.env.STOREFRONT_API_IP_RATE_LIMIT_MAX,
  120,
);
const API_USER_MAX = positiveInt(
  process.env.STOREFRONT_API_USER_RATE_LIMIT_MAX,
  60,
);
const AUTH_WINDOW_MS = positiveInt(
  process.env.STOREFRONT_AUTH_RATE_LIMIT_WINDOW_MS,
  60_000,
);
const AUTH_IP_MAX = positiveInt(
  process.env.STOREFRONT_AUTH_IP_RATE_LIMIT_MAX,
  20,
);
const AUTH_BACKOFF_BASE_MS = positiveInt(
  process.env.STOREFRONT_AUTH_BACKOFF_BASE_MS,
  1_000,
);
const AUTH_BACKOFF_MAX_MS = positiveInt(
  process.env.STOREFRONT_AUTH_BACKOFF_MAX_MS,
  60_000,
);
const AUTH_BACKOFF_RESET_MS = positiveInt(
  process.env.STOREFRONT_AUTH_BACKOFF_RESET_MS,
  15 * 60_000,
);

const apiIpLimiter = new FixedWindowRateLimiter(API_WINDOW_MS, API_IP_MAX);
const apiUserLimiter = new FixedWindowRateLimiter(API_WINDOW_MS, API_USER_MAX);
const authIpLimiter = new FixedWindowRateLimiter(AUTH_WINDOW_MS, AUTH_IP_MAX);
const authBackoff = new ExponentialBackoffTracker(
  AUTH_BACKOFF_BASE_MS,
  AUTH_BACKOFF_MAX_MS,
  AUTH_BACKOFF_RESET_MS,
);

export function getClientIpFromHeaders(headers: Pick<Headers, "get">): string {
  // ALB appends the verified client address to the right side of XFF. Taking
  // the last hop avoids trusting a user-supplied spoofed left-most value.
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (chain.length > 0) return chain[chain.length - 1];
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

function tooManyRequests(
  retryAfterSeconds: number,
  error = "rate_limited",
): NextResponse {
  return NextResponse.json(
    { error, retry_after: retryAfterSeconds },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export function maybeRateLimitApiRequest(req: NextRequest): NextResponse | null {
  const ip = getClientIpFromHeaders(req.headers);
  const decision = apiIpLimiter.consume(`ip:${ip}`);
  return decision.allowed ? null : tooManyRequests(decision.retryAfterSeconds);
}

export function maybeRateLimitAuthenticatedUser(
  userId: string,
): NextResponse | null {
  const decision = apiUserLimiter.consume(`user:${userId}`);
  return decision.allowed ? null : tooManyRequests(decision.retryAfterSeconds);
}

export function maybeRateLimitAuthRequest(req: NextRequest): NextResponse | null {
  const ip = getClientIpFromHeaders(req.headers);
  const decision = authIpLimiter.consume(`auth-ip:${ip}`);
  return decision.allowed
    ? null
    : tooManyRequests(decision.retryAfterSeconds, "auth_rate_limited");
}

export function maybeBlockForAuthBackoff(
  req: NextRequest,
): NextResponse | null {
  const ip = getClientIpFromHeaders(req.headers);
  const retryAfterSeconds = authBackoff.check(`auth-backoff:${ip}`);
  return retryAfterSeconds > 0
    ? tooManyRequests(retryAfterSeconds, "auth_backoff")
    : null;
}

export function noteAuthFailure(req: NextRequest): number {
  const ip = getClientIpFromHeaders(req.headers);
  return authBackoff.fail(`auth-backoff:${ip}`);
}

export function noteAuthSuccess(req: NextRequest): void {
  const ip = getClientIpFromHeaders(req.headers);
  authBackoff.success(`auth-backoff:${ip}`);
}
