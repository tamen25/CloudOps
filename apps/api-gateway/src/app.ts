// api-gateway Express app — the mesh edge and trace root. A synthetic
// `place-order` fans out across the whole chain: pricing → inventory → fraud →
// payment (which itself posts to the ledger). Each downstream is injected via
// `fetchImpl` so the orchestration is testable without live services. The
// gateway aggregates per-hop status so a partial failure is visible in the
// response (and the trace) rather than collapsing to a bare 502.
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';

export interface GatewayLogger {
  info: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

export interface GatewayDeps {
  pricingUrl: string;
  inventoryUrl: string;
  fraudUrl: string;
  paymentUrl: string;
  logger: GatewayLogger;
  fetchImpl?: typeof fetch;
}

// Forward synthetic + trace headers to every downstream hop so the whole chain
// shares one trace and stays filterable as synthetic load.
const FORWARD_HEADERS = ['traceparent', 'tracestate', 'x-synthetic', 'x-tenant-id'];

function downstreamHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  for (const h of FORWARD_HEADERS) {
    const v = req.header(h);
    if (v) headers[h] = v;
  }
  return headers;
}

interface HopResult {
  ok: boolean;
  status: number;
  body: any;
}

async function callHop(
  doFetch: typeof fetch,
  url: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<HopResult> {
  const res = await doFetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { ok: res.ok, status: res.status, body };
}

export function createApp(deps: GatewayDeps): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json({ limit: '64kb' }));
  const doFetch = deps.fetchImpl ?? fetch;

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/readyz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ready' });
  });

  // POST /v1/order — the deep-chain orchestration.
  app.post('/v1/order', async (req: Request, res: Response) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const tenantId = typeof req.body?.tenant_id === 'string' ? req.body.tenant_id : 'default';
    const headers = downstreamHeaders(req);
    const hops: Record<string, { status: number; ok: boolean }> = {};

    try {
      // 1. pricing — authoritative total.
      const pricing = await callHop(doFetch, `${deps.pricingUrl}/quote`, headers, { items });
      hops.pricing = { status: pricing.status, ok: pricing.ok };
      if (!pricing.ok) {
        res.status(502).json({ error: 'pricing_failed', hops });
        return;
      }
      const totalCents: number = pricing.body?.total_cents ?? 0;

      // 2. inventory — reserve stock.
      const inventory = await callHop(doFetch, `${deps.inventoryUrl}/reserve`, headers, { items });
      hops.inventory = { status: inventory.status, ok: inventory.ok };
      if (!inventory.ok || inventory.body?.reserved === false) {
        res.status(409).json({ error: 'out_of_stock', hops });
        return;
      }

      // 3. fraud — risk score.
      const fraud = await callHop(doFetch, `${deps.fraudUrl}/score`, headers, {
        amount_cents: totalCents,
        item_count: items.length,
        tenant_id: tenantId,
      });
      hops.fraud = { status: fraud.status, ok: fraud.ok };
      if (fraud.ok && fraud.body?.decision === 'deny') {
        res.status(403).json({ error: 'fraud_denied', score: fraud.body?.score, hops });
        return;
      }

      // 4. payment — authorize + post to ledger.
      const payment = await callHop(doFetch, `${deps.paymentUrl}/authorize`, headers, {
        amount_cents: totalCents,
        tenant_id: tenantId,
      });
      hops.payment = { status: payment.status, ok: payment.ok };
      if (!payment.ok) {
        res.status(402).json({ error: 'payment_failed', hops });
        return;
      }

      res.status(200).json({
        status: 'placed',
        total_cents: totalCents,
        auth_id: payment.body?.auth_id,
        entry_id: payment.body?.entry_id,
        fraud_decision: fraud.body?.decision ?? 'unknown',
        hops,
      });
    } catch (err) {
      deps.logger.error({ err, hops }, 'gateway fan-out failed');
      res.status(502).json({ error: 'upstream_unavailable', hops });
    }
  });

  return app;
}
