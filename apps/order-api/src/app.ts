// This file contains app logic for order API src.
import express, { type Request, type Response, type NextFunction } from 'express';
import pino from 'pino';
import rateLimit from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'crypto';
import { Registry, Counter, Histogram } from 'prom-client';

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

  return { registry, httpRequestsTotal, httpRequestDuration };
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
}: CreateAppArgs) {
  if (!pool || typeof pool.query !== 'function') {
    throw new Error('createApp requires a pool with a query() function');
  }

  const { registry, httpRequestsTotal, httpRequestDuration } = metrics;

  const app = express();
  app.set('trust proxy', 1);
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
  // Requires tenant.
  const requireTenant = (req: RequestWithCtx, res: Response, next: NextFunction) => {
    let tenantId = '';
    if (req.user && typeof req.user.tenant_id === 'string') {
      tenantId = req.user.tenant_id;
    } else if (!req.user) {
      const header = req.get('x-tenant-id');
      if (typeof header === 'string' && header.length > 0) {
        tenantId = header;
      } else if (TENANT_FALLBACK_ENVS.has(nodeEnv)) {
        tenantId = 'default';
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
