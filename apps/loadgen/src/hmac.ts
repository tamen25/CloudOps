// Verify side of the internal HMAC scheme (mirrors order-api + ledger): the
// signature is hex(HMAC-SHA256(secret, timestamp.tenant.rawBody)) in x-cloudops-hmac,
// with x-cloudops-timestamp (5-min skew) and x-cloudops-tenant. The loadgen
// control API is internal-only; the storefront BFF signs requests to it.
import { createHmac, timingSafeEqual } from 'crypto';

const SKEW_MS = 5 * 60 * 1000;
const TENANT_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export interface VerifyResult {
  ok: boolean;
  status: number;
  reason?: string;
  tenant?: string;
}

function compute(timestamp: string, tenant: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${tenant}.${rawBody}`).digest('hex');
}

function tryHmac(timestamp: string, tenant: string, rawBody: string, given: string, secret: string): boolean {
  if (!secret) return false;
  const expected = compute(timestamp, tenant, rawBody, secret);
  const a = Buffer.from(given, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface VerifyHeaders {
  hmac?: string;
  timestamp?: string;
  tenant?: string;
}

export function verifyInternalHmac(
  headers: VerifyHeaders,
  rawBody: string,
  active: string,
  previous: string,
  nowMillis: number = Date.now(),
): VerifyResult {
  if (!active) return { ok: false, status: 503, reason: 'internal_hmac_not_configured' };
  const { hmac, timestamp, tenant } = headers;
  if (!hmac || !timestamp || !tenant) return { ok: false, status: 401, reason: 'hmac_missing' };
  const ts = parseInt(timestamp, 10);
  if (!Number.isInteger(ts) || Math.abs(nowMillis - ts) > SKEW_MS) {
    return { ok: false, status: 401, reason: 'hmac_stale' };
  }
  if (!TENANT_RE.test(tenant)) return { ok: false, status: 401, reason: 'invalid_tenant' };
  if (tryHmac(timestamp, tenant, rawBody, hmac, active) || tryHmac(timestamp, tenant, rawBody, hmac, previous)) {
    return { ok: true, status: 200, tenant };
  }
  return { ok: false, status: 401, reason: 'hmac_invalid' };
}

export { compute as computeHmac };
