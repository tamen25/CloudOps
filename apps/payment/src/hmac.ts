// Signs internal requests to the ledger using the same scheme order-api +
// ledger verify: sha256hex(timestamp.tenant.rawBody.secret), carried in
// x-cloudops-hmac with x-cloudops-timestamp + x-cloudops-tenant.
import { createHash } from 'crypto';

export function computeHmac(timestamp: string, tenant: string, rawBody: string, secret: string): string {
  return createHash('sha256').update(`${timestamp}.${tenant}.${rawBody}.${secret}`).digest('hex');
}

export interface SignedHeaders {
  'content-type': string;
  'x-cloudops-timestamp': string;
  'x-cloudops-tenant': string;
  'x-cloudops-hmac': string;
}

export function signInternal(
  tenant: string,
  rawBody: string,
  secret: string,
  nowMillis: number = Date.now(),
): SignedHeaders {
  const timestamp = String(nowMillis);
  return {
    'content-type': 'application/json',
    'x-cloudops-timestamp': timestamp,
    'x-cloudops-tenant': tenant,
    'x-cloudops-hmac': computeHmac(timestamp, tenant, rawBody, secret),
  };
}
