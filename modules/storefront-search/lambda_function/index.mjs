// search-gateway Lambda — closes backlog #82.
//
// Receives API GW HTTP v2 events. API GW handles Cognito JWT verification
// via the JWT authorizer; this Lambda reads claims off the authorizer
// context. Tenant resolved from custom:tenant_id (Cognito custom attr).
// In-memory LRU cache on `tenant#q#cursor`, 60s TTL, max 500 entries.
// HMAC-signs requests to order-api `_internal/search`.

import { createHash } from "node:crypto";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ORDER_API_URL = process.env.ORDER_API_INTERNAL_URL || "";
const HMAC_PARAM = process.env.HMAC_SECRET_PARAMETER_NAME || "";

// order-api answers a search in well under a second; past this the client
// gets a 504 instead of waiting out the Lambda timeout.
const UPSTREAM_TIMEOUT_MS = 5000;

const CACHE_MAX = 500;
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // key -> { value, expiresAt }

let cachedSecret = null;
let cachedSecretAt = 0;
const SECRET_TTL_MS = 5 * 60 * 1000;
const ssm = HMAC_PARAM ? new SSMClient({}) : null;

async function getHmacSecret() {
  if (!HMAC_PARAM) {
    return process.env.INTERNAL_HMAC_SECRET || "";
  }
  if (cachedSecret && Date.now() - cachedSecretAt < SECRET_TTL_MS) {
    return cachedSecret;
  }
  const res = await ssm.send(
    new GetParameterCommand({ Name: HMAC_PARAM, WithDecryption: true })
  );
  cachedSecret = res.Parameter?.Value || "";
  cachedSecretAt = Date.now();
  return cachedSecret;
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function jsonResponse(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function resolveTenant(event) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims || {};
  return claims["custom:tenant_id"] || claims.tenant_id || null;
}

async function callExpressSearch(tenantId, query, limit) {
  const secret = await getHmacSecret();
  if (!secret) {
    return { status: 503, body: { error: "hmac_not_configured" } };
  }
  if (!ORDER_API_URL) {
    return { status: 503, body: { error: "order_api_url_not_configured" } };
  }

  const payload = JSON.stringify({ q: query, limit });
  const timestamp = String(Date.now());
  const hmac = createHash("sha256")
    .update(`${timestamp}.${tenantId}.${payload}.${secret}`)
    .digest("hex");

  let res;
  try {
    res = await fetch(`${ORDER_API_URL}/_internal/search`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cloudops-hmac": hmac,
        "x-cloudops-timestamp": timestamp,
        "x-cloudops-tenant": tenantId,
      },
      body: payload,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err?.name === "TimeoutError";
    console.error("search upstream failed", { err: err?.message });
    return { status: timedOut ? 504 : 502, body: { error: timedOut ? "upstream_timeout" : "upstream_unreachable" } };
  }

  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    // The upstream body is logged, never returned: it can carry internals.
    // A 200 with a body that is not JSON is a failure, not a result to cache.
    console.error("search upstream returned invalid JSON", { status: res.status, body: text.slice(0, 256) });
    return { status: 502, body: { error: "upstream_invalid_json" } };
  }
}

export const handler = async (event) => {
  const tenantId = resolveTenant(event);
  if (!tenantId) {
    return jsonResponse(401, { error: "tenant_missing" });
  }

  const routeKey = event.routeKey || "";
  const query = (event.queryStringParameters?.q || "").trim();
  const limitRaw = parseInt(event.queryStringParameters?.limit ?? "20", 10);
  const limit = Math.min(Math.max(Number.isInteger(limitRaw) ? limitRaw : 20, 1), 50);

  if (routeKey === "GET /search") {
    if (!query || query.length > 200) {
      return jsonResponse(400, { error: "invalid_query" });
    }
    const cacheKey = `${tenantId}#search#${query}#${limit}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return jsonResponse(200, cached, { "x-cache": "HIT" });
    }
    const upstream = await callExpressSearch(tenantId, query, limit);
    if (upstream.status === 200) {
      cacheSet(cacheKey, upstream.body);
      return jsonResponse(200, upstream.body, { "x-cache": "MISS" });
    }
    return jsonResponse(upstream.status, upstream.body);
  }

  if (routeKey === "GET /products/{id}") {
    return jsonResponse(501, { error: "not_implemented" });
  }

  return jsonResponse(404, { error: "route_not_found", route: routeKey });
};
