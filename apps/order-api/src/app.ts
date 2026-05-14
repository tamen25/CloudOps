// This file contains app logic for order API src.
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import pino from 'pino';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import { Registry, Counter, Histogram } from 'prom-client';
import type { OrderEvent } from './kinesis';

// Order payload schema (closes backlog #44).
const MAX_ITEMS = 50;
const MAX_SKU_LEN = 64;
const MAX_QUANTITY = 999;
const MAX_TOTAL = 1_000_000;

interface OrderItem { sku: string; quantity: number; }
interface OrderBody { items: OrderItem[]; total: number; }
type ValidationResult =
  | { ok: false; error: string }
  | { ok: true; value: OrderBody };

// Validates order payload.
export function validateOrderPayload(body: any): ValidationResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'body must be a JSON object' };
  }

  const { items, total } = body;

  if (!Array.isArray(items)) return { ok: false, error: 'items must be an array' };
  if (items.length < 1 || items.length > MAX_ITEMS) {
    return { ok: false, error: `items length must be between 1 and ${MAX_ITEMS}` };
  }
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    if (!it || typeof it !== 'object' || Array.isArray(it)) return { ok: false, error: `items[${i}] must be an object` };
    if (typeof it.sku !== 'string' || it.sku.length < 1 || it.sku.length > MAX_SKU_LEN) return { ok: false, error: `items[${i}].sku must be a 1–${MAX_SKU_LEN} char string` };
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > MAX_QUANTITY) return { ok: false, error: `items[${i}].quantity must be an integer 1–${MAX_QUANTITY}` };
  }

  if (typeof total !== 'number' || !Number.isFinite(total)) return { ok: false, error: 'total must be a finite number' };
  if (total < 0 || total > MAX_TOTAL) return { ok: false, error: `total must be between 0 and ${MAX_TOTAL}` };
  if (Math.abs(total * 100 - Math.round(total * 100)) > 1e-6) return { ok: false, error: 'total must have at most 2 decimal places' };

  return { ok: true, value: { items: items.map((it: OrderItem) => ({ sku: it.sku, quantity: it.quantity })), total } };
}

export interface CreateMetricsArgs { serviceName?: string; environment?: string }
// Creates metrics.
export function createMetrics({ serviceName = 'order-api', environment = 'dev' }: CreateMetricsArgs = {}) {
  const registry = new Registry();
  registry.setDefaultLabels({ service: serviceName, environment });

  const httpRequestsTotal = new Counter({ /* node:coverage ignore next */
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status'],
    registers: [registry],
  });

  const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  // JWT verify outcome counter (closes backlog #104). `outcome` is one of:
  //   ok                  — token verified
  //   invalid_signature   — signature did not match any JWKS key
  //   expired             — token past `exp`
  //   wrong_issuer        — `iss` claim mismatch
  //   wrong_audience      — `aud` claim mismatch
  //   missing_scope       — required scope not present
  //   jwks_unreachable    — JWKS endpoint fetch failed (network / DNS / 5xx)
  //   other               — anything else from jose
  // The `jwks_unreachable` bucket is the signal for the PrometheusRule
  // `OIDCJWKSUnreachable` (modules/observability/jwks_alerts.tf). When that
  // rate spikes the IdP (Cognito) is unreachable and every Bearer auth call
  // is failing — page on it.
  const jwtVerifyTotal = new Counter({
    name: 'jwt_verify_total',
    help: 'JWT verification outcomes (closes backlog #104)',
    labelNames: ['outcome'],
    registers: [registry],
  });

  return { registry, httpRequestsTotal, httpRequestDuration, jwtVerifyTotal };
}

type Pool = { query: (...a: any[]) => Promise<any>; connect?: () => Promise<any> };
type Logger = { info: (...a: any[]) => void; warn: (...a: any[]) => void; error: (...a: any[]) => void };

export interface CreateAppArgs {
  pool: Pool;
  logger?: Logger;
  nodeEnv?: string;
  awsRegion?: string;
  serviceName?: string;
  apiKey?: string;
  jwtVerifier?: ((req: Request, res: Response, next: NextFunction) => void) | null;
  rateLimitWindowMs?: number;
  rateLimitMax?: number;
  metrics?: ReturnType<typeof createMetrics>;
  publishOrderEvent?: (event: OrderEvent) => Promise<{ ok: boolean; error?: string }>;
}

type RequestWithCtx = Request & { user?: any; tenantId?: string };

// Creates app.
export function createApp({
  pool,
  logger = pino({ level: 'info' }) as unknown as Logger,
  nodeEnv = 'dev',
  awsRegion = 'us-east-1',
  serviceName = 'order-api',
  apiKey = '',
  jwtVerifier = null,
  rateLimitWindowMs = 60 * 1000,
  rateLimitMax = 60,
  metrics = createMetrics({ serviceName, environment: nodeEnv }),
  publishOrderEvent,
}: CreateAppArgs) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('createApp requires a pool with a query() function');
  }

  const { registry, httpRequestsTotal, httpRequestDuration } = metrics;

  const app = express();
  app.set('trust proxy', 1);

  // Security headers (closes backlog #101). This is a JSON API — no HTML
  // ever rendered — so the CSP defaults are off (`contentSecurityPolicy: false`).
  // Everything else is on: HSTS (1y, include subdomains), X-Content-Type-Options
  // nosniff, X-Frame-Options DENY (no iframe embedding), Referrer-Policy no-referrer,
  // hide X-Powered-By. crossOriginResourcePolicy is "same-origin" so a browser
  // cannot embed JSON responses cross-origin (defense in depth alongside #97).
  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: false },
    referrerPolicy: { policy: 'no-referrer' },
    crossOriginResourcePolicy: { policy: 'same-origin' },
  }));

  app.use(express.json({ limit: '64kb' }));

  // Body-parser error handler (oversize body, malformed JSON).
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: 'payload_too_large' });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: 'invalid_json' });
    }
    return next(err);
  });

  // CSRF Origin check (#97). The API is normally called server-to-server
  // (Next.js RSC, Lambda, Step Functions) — those fetches do NOT send an
  // Origin header, so they pass through. A browser-initiated cross-origin
  // POST/PUT/PATCH/DELETE WILL carry Origin; we reject any value not on
  // the allow-list. ALLOWED_ORIGINS is a comma-separated list (e.g.
  // "https://app.example.com,https://admin.example.com"). Empty/unset =
  // permissive (dev + back-compat). The check skips `/_internal/*` because
  // those routes are HMAC-gated and never reachable from a browser
  // anyway, and skips safe methods (GET/HEAD/OPTIONS).
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (allowedOrigins.length === 0) return next();
    if (!STATE_CHANGING.has(req.method)) return next();
    if (req.path.startsWith('/_internal/')) return next();
    const origin = req.get('origin');
    if (!origin) return next(); // server-to-server fetch
    if (allowedOrigins.includes(origin)) return next();
    return res.status(403).json({ success: false, error: 'origin_not_allowed' });
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const route = req.route ? req.route.path : req.path;
      const labels = { method: req.method, route, status: String(res.statusCode) };
      httpRequestsTotal.inc(labels);
      httpRequestDuration.observe(labels, (Date.now() - start) / 1000);
    });
    next();
  });

  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      environment: nodeEnv,
      region: awsRegion,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // /* node:coverage ignore next 2 */ — closing braces after try/catch
  // arrow-fn appear uncovered under tsx source-map even though the body is
  // tested both for success and failure cases (see app.test.ts).
  app.get('/ready', async (_req: Request, res: Response) => {
    try {
      await pool.query('SELECT 1');
      res.status(200).json({ status: 'ready', timestamp: new Date().toISOString() });
    } catch (err) {
      logger.warn({ err }, 'readiness check failed');
      res.status(503).json({ status: 'not_ready', error: 'database_unreachable' });
    } /* node:coverage ignore next 2 */
  });


  // Two-tier rate limit (closes backlog #45).
  const unauthLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: Math.max(rateLimitMax * 2, 120),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
  });

  const dataLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'too_many_requests' },
    keyGenerator: (req: RequestWithCtx) => {
      if (req.tenantId) return `tenant:${req.tenantId}`;
      if (req.user && req.user.sub) return `user:${req.user.sub}`;
      return `ip:${req.ip}`;
    },
  });

  // Requires API key.
  const requireApiKey = (req: RequestWithCtx, res: Response, next: NextFunction) => {
    if (req.user) return next();
    if (!apiKey) return next();

    const presented = req.get('x-api-key') || '';
    const a = Buffer.from(presented);
    const b = Buffer.from(apiKey);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    next();
  };

  const TENANT_RE = /^[a-zA-Z0-9_-]{1,64}$/;
  const TENANT_FALLBACK_ENVS = new Set(['dev', 'test', 'local']);
  // Tenant resolution precedence (closes backlog #100, see docs/adr/021-tenant-claim-precedence.md):
  //   1. JWT `custom:tenant_id` claim — Cognito's namespaced user attribute.
  //      This is the canonical source; Cognito always issues this exact key
  //      for tenant assignment done at signup (#80).
  //   2. JWT `tenant_id` claim — fallback for non-Cognito IdPs (raw OIDC
  //      providers, internal SSO with custom claim mapping).
  //   3. `X-Tenant-Id` request header — API-key path only (no JWT). Used by
  //      back-channel callers (search-gateway Lambda, integration tests).
  //   4. Literal `default` — dev/test/local fallback for unauth local runs.
  //
  // If a JWT is present we ONLY look at claims; we do NOT fall through to
  // the X-Tenant-Id header. Otherwise a caller with a valid token could
  // pivot to any tenant by forging the header. Same reason rules 1+2 are
  // mutually exclusive — once `custom:tenant_id` is set, the flat claim is
  // ignored (we never need to "merge" claims from one issuer).
  const requireTenant = (req: RequestWithCtx, res: Response, next: NextFunction) => {
    let tenantId = '';
    if (req.user) {
      // Rule 1: Cognito custom attribute
      const cognitoClaim = (req.user as Record<string, unknown>)['custom:tenant_id'];
      if (typeof cognitoClaim === 'string') {
        tenantId = cognitoClaim;
      } else if (typeof req.user.tenant_id === 'string') {
        // Rule 2: generic OIDC flat claim
        tenantId = req.user.tenant_id;
      }
      // No X-Tenant-Id fallback on the JWT path — see comment above.
    } else {
      // No JWT: API-key path.
      const header = req.get('x-tenant-id');
      if (typeof header === 'string' && header.length > 0) {
        tenantId = header; // Rule 3
      } else if (TENANT_FALLBACK_ENVS.has(nodeEnv)) {
        tenantId = 'default'; // Rule 4
      }
    }

    if (!TENANT_RE.test(tenantId)) {
      return res.status(400).json({ error: 'invalid_tenant', detail: 'tenant_id missing or malformed' });
    }
    req.tenantId = tenantId;
    next();
  };

  const authChain = jwtVerifier
    ? [unauthLimiter, jwtVerifier, requireApiKey, requireTenant, dataLimiter]
    : [unauthLimiter, requireApiKey, requireTenant, dataLimiter];

  // Closes backlog #51 — RLS transaction wrapper.
  async function withTenant<T>(tenantId: string, fn: (client: any) => Promise<T>): Promise<T> {
    if (typeof pool.connect !== 'function') {
      return fn(pool);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* best-effort */ }
      throw err;
    } finally {
      client.release();
    }
  }

  // Idempotency SQL kept as single-line constants so v8 source-map line
  // counting does not penalise the closing braces of multi-line calls.
  const IDEMP_INSERT_SQL = `INSERT INTO order_idempotency_keys (tenant_id, idempotency_key, request_hash, status_code, response_body, order_id, expires_at) VALUES ($1, $2, $3, 0, '{}'::jsonb, NULL, NOW() + ($4 || ' milliseconds')::interval) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING tenant_id`;
  const IDEMP_SELECT_SQL = `SELECT request_hash, status_code, response_body FROM order_idempotency_keys WHERE tenant_id = $1 AND idempotency_key = $2 FOR UPDATE`;
  const IDEMP_UPDATE_SQL = `UPDATE order_idempotency_keys SET status_code = $3, response_body = $4, order_id = $5 WHERE tenant_id = $1 AND idempotency_key = $2`;
  const ORDER_INSERT_SQL = 'INSERT INTO orders (order_id, items, total, environment, tenant_id) VALUES ($1, $2, $3, $4, $5) RETURNING *';
  // Audit events (closes backlog #73). Written inside the same tenant
  // transaction as the order INSERT, so the audit row commits or rolls
  // back atomically with the business change.
  const AUDIT_INSERT_SQL = `INSERT INTO audit_events (tenant_id, actor_id, action, request_id, resource_id, status_code, result, error_code, metadata) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`;

  app.post('/order', ...authChain, async (req: RequestWithCtx, res: Response) => {
    const validation = validateOrderPayload(req.body);
    if (validation.ok === false) return res.status(400).json({ success: false, error: 'invalid_request', detail: validation.error });

    // Idempotency-Key is optional but, when supplied, must be well-formed
    // (closes backlog #72). Tenant scoping is enforced via the composite
    // primary key + RLS on `order_idempotency_keys`.
    const idempotencyKey = req.get('idempotency-key');
    if (idempotencyKey !== undefined && !IDEMPOTENCY_KEY_RE.test(idempotencyKey)) return res.status(400).json({ success: false, error: 'invalid_request', detail: 'Idempotency-Key must be 1–255 ASCII printable chars' });

    const { items, total } = validation.value;
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const requestHash = idempotencyKey ? hashOrderPayload(validation.value) : '';

    const actorId = (req.user && (req.user.sub || req.user.client_id)) || null;
    const requestId = req.get('x-request-id') || null;

    try {
      const outcome = await withTenant(req.tenantId!, async (client) => {
        if (idempotencyKey) {
          const claim = await client.query(IDEMP_INSERT_SQL, [req.tenantId, idempotencyKey, requestHash, String(IDEMPOTENCY_TTL_MS)]);
          if (claim.rowCount === 0) {
            const existing = await client.query(IDEMP_SELECT_SQL, [req.tenantId, idempotencyKey]);
            if (existing.rowCount === 0) throw new Error('idempotency lookup race — row vanished after conflict');
            const row = existing.rows[0];
            if (row.request_hash !== requestHash) return { status: 409, body: { success: false, error: 'idempotency_conflict', detail: 'Idempotency-Key reused with a different payload' } };
            return { status: row.status_code as number, body: row.response_body as Record<string, unknown> }; /* node:coverage ignore next 3 */
          }
        }

        const result: any = await client.query(ORDER_INSERT_SQL, [orderId, JSON.stringify(items), total, nodeEnv, req.tenantId]);
        const responseBody = { success: true, order: result.rows[0] };
        if (idempotencyKey) await client.query(IDEMP_UPDATE_SQL, [req.tenantId, idempotencyKey, 201, JSON.stringify(responseBody), orderId]);
        await client.query(AUDIT_INSERT_SQL, [req.tenantId, actorId, 'order.create', requestId, orderId, 201, 'success', null, JSON.stringify({ total, item_count: items.length })]);
        return { status: 201, body: responseBody };
      });

      logger.info({ orderId, total, tenant: req.tenantId, status: outcome.status }, 'order request processed');
      // Post-commit Kinesis publish (closes backlog #85). Outside withTenant
      // so a Kinesis outage cannot roll back the order. Failure writes a
      // best-effort audit row with result='kinesis_publish_failed'.
      if (publishOrderEvent && outcome.status === 201) {
        try {
          const publish = await publishOrderEvent({
            tenantId: req.tenantId!,
            orderId,
            type: 'order.created',
            payload: { total, item_count: items.length },
          });
          if (!publish.ok) {
            logger.warn({ orderId, err: publish.error }, 'kinesis publish failed; writing audit row');
            try {
              await withTenant(req.tenantId!, (client) =>
                client.query(AUDIT_INSERT_SQL, [req.tenantId, actorId, 'order.created', requestId, orderId, 201, 'kinesis_publish_failed', publish.error ?? null, JSON.stringify({ total, item_count: items.length })]));
            } catch (auditErr) {
              logger.error({ auditErr }, 'failed to write audit event for kinesis_publish_failed');
            }
          }
        } catch (publishErr) {
          logger.error({ publishErr }, 'unexpected kinesis publish error');
        }
      }
      res.status(outcome.status).json(outcome.body);
    } catch (err) {
      logger.error({ err }, 'failed to create order');
      // Best-effort audit write for failures. Uses a fresh tenant transaction
      // because the original one is rolled back. RLS still scopes the row.
      try {
        await withTenant(req.tenantId!, (client) =>
          client.query(AUDIT_INSERT_SQL, [req.tenantId, actorId, 'order.create.failed', requestId, orderId, 500, 'failure', 'internal_error', JSON.stringify({ total, item_count: items.length })]));
      } catch (auditErr) {
        logger.error({ auditErr }, 'failed to write audit event for order.create.failed');
      }
      res.status(500).json({ success: false, error: 'Failed to process order' });
    }
  });

  app.get('/orders', ...authChain, async (req: RequestWithCtx, res: Response) => {
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(
          'SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100',
          [req.tenantId],
        ),
      );
      res.status(200).json({ orders: result.rows, count: result.rowCount });
    } catch (err) {
      logger.error({ err }, 'failed to fetch orders');
      res.status(500).json({ success: false, error: 'Failed to fetch orders' });
    }
  });

  // ── Products (closes backlog #81) ─────────────────────────────────────
  // Public-read but tenant-scoped — every query routes through withTenant()
  // so RLS enforces the boundary regardless of who calls. Internal routes
  // (search + admin CRUD) are HMAC-gated and consumed by the search-gateway
  // Lambda (#82) and admin UI (#88).
  const PRODUCT_LIST_SQL = 'SELECT id, sku, name, description, price_cents, qty, image_key, created_at FROM products WHERE is_active = true ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2';
  const PRODUCT_GET_SQL = 'SELECT id, sku, name, description, price_cents, qty, image_key, created_at FROM products WHERE id = $1 AND is_active = true';
  const PRODUCT_SEARCH_SQL = "SELECT id, sku, name, price_cents, qty, image_key, ts_rank_cd(search_tsv, q) AS rank FROM products, plainto_tsquery('english', $1) AS q WHERE search_tsv @@ q AND is_active = true ORDER BY rank DESC, created_at DESC LIMIT $2";
  const PRODUCT_INSERT_SQL = 'INSERT INTO products (tenant_id, sku, name, description, price_cents, qty, image_key, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id';
  const PRODUCT_UPDATE_SQL = 'UPDATE products SET name = COALESCE($2, name), description = COALESCE($3, description), price_cents = COALESCE($4, price_cents), qty = COALESCE($5, qty), image_key = COALESCE($6, image_key), is_active = COALESCE($7, is_active), updated_at = NOW() WHERE id = $1 RETURNING id';
  const PRODUCT_DELETE_SQL = 'DELETE FROM products WHERE id = $1 RETURNING id';

  app.get('/products', ...authChain, async (req: RequestWithCtx, res: Response) => {
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_LIST_SQL, [limit, offset])
      );
      res.json({ success: true, products: result.rows, limit, offset });
    } catch (err) {
      logger.error({ err }, 'failed to list products');
      res.status(500).json({ success: false, error: 'Failed to list products' });
    }
  });

  app.get('/products/:id', ...authChain, async (req: RequestWithCtx, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'invalid_id' });
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_GET_SQL, [id])
      );
      if (!result.rows || result.rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });
      res.json({ success: true, product: result.rows[0] });
    } catch (err) {
      logger.error({ err }, 'failed to fetch product');
      res.status(500).json({ success: false, error: 'Failed to fetch product' });
    }
  });

  // HMAC middleware for internal routes — signed by the search-gateway
  // Lambda (#82) and admin UI server (#88). Secret rotates via External
  // Secrets / Secrets Manager.
  //
  // Dual-accept rotation (#96): INTERNAL_HMAC_SECRET is the active key;
  // INTERNAL_HMAC_SECRET_PREVIOUS is an optional grace-window key accepted
  // for the rotation overlap. During rotation, External Secrets writes the
  // new value to `hmac-secret` and the old to `hmac-secret-previous`; once
  // every caller has rolled, clear the previous slot. Both checks run in
  // constant time so timing does not leak which slot matched.
  const internalHmacSecret = process.env.INTERNAL_HMAC_SECRET ?? '';
  const internalHmacSecretPrevious = process.env.INTERNAL_HMAC_SECRET_PREVIOUS ?? '';
  const tryHmac = (timestamp: string, tenantHeader: string, raw: string, given: Buffer, secret: string): boolean => {
    if (!secret) return false;
    const expected = createHash('sha256').update(`${timestamp}.${tenantHeader}.${raw}.${secret}`).digest('hex');
    const exp = Buffer.from(expected, 'hex');
    return given.length === exp.length && timingSafeEqual(given, exp);
  };
  const requireInternalHmac = (req: Request, res: Response, next: NextFunction) => {
    if (!internalHmacSecret) return res.status(503).json({ success: false, error: 'internal_hmac_not_configured' });
    const header = req.get('x-cloudops-hmac');
    const timestamp = req.get('x-cloudops-timestamp');
    const tenantHeader = req.get('x-cloudops-tenant');
    if (!header || !timestamp || !tenantHeader) return res.status(401).json({ success: false, error: 'hmac_missing' });
    const ts = parseInt(timestamp, 10);
    if (!Number.isInteger(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
      return res.status(401).json({ success: false, error: 'hmac_stale' });
    }
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tenantHeader)) return res.status(401).json({ success: false, error: 'invalid_tenant' });
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const given = Buffer.from(header, 'hex');
    const matchedActive = tryHmac(timestamp, tenantHeader, raw, given, internalHmacSecret);
    const matchedPrevious = tryHmac(timestamp, tenantHeader, raw, given, internalHmacSecretPrevious);
    if (!matchedActive && !matchedPrevious) {
      return res.status(401).json({ success: false, error: 'hmac_invalid' });
    }
    if (matchedPrevious && !matchedActive) {
      logger.warn({ tenant: tenantHeader }, 'internal HMAC accepted via PREVIOUS secret — caller still on old key');
    }
    (req as RequestWithCtx).tenantId = tenantHeader;
    next();
  };

  app.post('/_internal/search', requireInternalHmac, async (req: RequestWithCtx, res: Response) => {
    const body = (req.body ?? {}) as { q?: unknown; limit?: unknown };
    const q = typeof body.q === 'string' ? body.q.trim() : '';
    if (!q || q.length > 200) return res.status(400).json({ success: false, error: 'invalid_query' });
    const limit = Math.min(Math.max(Number.isInteger(body.limit) ? (body.limit as number) : 20, 1), 50);
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_SEARCH_SQL, [q, limit])
      );
      res.json({ success: true, results: result.rows, limit });
    } catch (err) {
      logger.error({ err }, 'internal search failed');
      res.status(500).json({ success: false, error: 'search_failed' });
    }
  });

  app.post('/_internal/admin/products', requireInternalHmac, async (req: RequestWithCtx, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sku = typeof body.sku === 'string' ? body.sku : '';
    const name = typeof body.name === 'string' ? body.name : '';
    const priceCents = typeof body.price_cents === 'number' && Number.isInteger(body.price_cents) ? body.price_cents : null;
    if (!sku || sku.length > 64 || !name || name.length > 1000 || priceCents === null || priceCents < 0) {
      return res.status(400).json({ success: false, error: 'invalid_product' });
    }
    const description = typeof body.description === 'string' ? body.description : null;
    const qty = Number.isInteger(body.qty) ? (body.qty as number) : 0;
    const imageKey = typeof body.image_key === 'string' ? body.image_key : null;
    const isActive = typeof body.is_active === 'boolean' ? body.is_active : true;
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_INSERT_SQL, [req.tenantId, sku, name, description, priceCents, qty, imageKey, isActive])
      );
      res.status(201).json({ success: true, id: result.rows?.[0]?.id ?? null });
    } catch (err) {
      logger.error({ err }, 'admin create product failed');
      res.status(500).json({ success: false, error: 'create_failed' });
    }
  });

  app.put('/_internal/admin/products/:id', requireInternalHmac, async (req: RequestWithCtx, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'invalid_id' });
    const body = (req.body ?? {}) as Record<string, unknown>;
    const args = [
      id,
      typeof body.name === 'string' ? body.name : null,
      typeof body.description === 'string' ? body.description : null,
      Number.isInteger(body.price_cents) ? body.price_cents : null,
      Number.isInteger(body.qty) ? body.qty : null,
      typeof body.image_key === 'string' ? body.image_key : null,
      typeof body.is_active === 'boolean' ? body.is_active : null,
    ];
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_UPDATE_SQL, args)
      );
      if (!result.rows || result.rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });
      res.json({ success: true, id });
    } catch (err) {
      logger.error({ err }, 'admin update product failed');
      res.status(500).json({ success: false, error: 'update_failed' });
    }
  });

  app.delete('/_internal/admin/products/:id', requireInternalHmac, async (req: RequestWithCtx, res: Response) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'invalid_id' });
    try {
      const result: any = await withTenant(req.tenantId!, (client) =>
        client.query(PRODUCT_DELETE_SQL, [id])
      );
      if (!result.rows || result.rows.length === 0) return res.status(404).json({ success: false, error: 'not_found' });
      res.json({ success: true, id });
    } catch (err) {
      logger.error({ err }, 'admin delete product failed');
      res.status(500).json({ success: false, error: 'delete_failed' });
    }
  });

  app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
      service: serviceName,
      version: '1.0.0',
      environment: nodeEnv,
      endpoints: {
        health: 'GET /health',
        metrics: 'GET /metrics',
        createOrder: 'POST /order',
        getOrders: 'GET /orders',
        listProducts: 'GET /products',
        getProduct: 'GET /products/:id',
      },
    });
  });

  return { app, registry };
}

// Creates metrics app.
export function createMetricsApp({ registry }: { registry: Registry }) {
  const app = express();
  app.get('/metrics', async (_req: Request, res: Response) => {
    res.set('Content-Type', registry.contentType);
    res.end(await registry.metrics());
  });
  app.get('/health', (_req: Request, res: Response) => res.status(200).json({ status: 'ok' }));
  return app;
}

// Idempotency-Key header (closes backlog #72). Keep the format conservative:
// ASCII printable, 1–255 chars. Mirrors the CHECK constraint on the table.
const IDEMPOTENCY_KEY_RE = /^[\x21-\x7e]{1,255}$/;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h replay window

// Hashes order payload.
export function hashOrderPayload(value: OrderBody): string {
  const canonical = JSON.stringify({
    items: value.items.map((it) => ({ sku: it.sku, quantity: it.quantity })),
    total: value.total,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
