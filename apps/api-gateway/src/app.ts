// api-gateway Express app — the mesh edge. Receives a synthetic request and
// fans out to downstream services (pricing first; more hops added in Phase 2),
// acting as the trace root. The downstream caller is injected (`fetchImpl`) so
// the fan-out is testable without live services.
import express, { type Express, type Request, type Response } from 'express';
import helmet from 'helmet';

export interface GatewayLogger {
  info: (...a: unknown[]) => void;
  error: (...a: unknown[]) => void;
}

export interface GatewayDeps {
  pricingUrl: string;
  logger: GatewayLogger;
  fetchImpl?: typeof fetch;
}

// Forward the synthetic + trace headers to every downstream hop so the whole
// chain shares one trace and stays filterable as synthetic load.
const FORWARD_HEADERS = ['traceparent', 'tracestate', 'x-synthetic', 'x-tenant-id'];

function downstreamHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  for (const h of FORWARD_HEADERS) {
    const v = req.header(h);
    if (v) headers[h] = v;
  }
  return headers;
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

  // POST /v1/order — fan out to pricing, aggregate, return the quote.
  app.post('/v1/order', async (req: Request, res: Response) => {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    try {
      const pr = await doFetch(`${deps.pricingUrl}/quote`, {
        method: 'POST',
        headers: downstreamHeaders(req),
        body: JSON.stringify({ items }),
      });
      if (!pr.ok) {
        deps.logger.error({ status: pr.status }, 'pricing returned non-2xx');
        res.status(502).json({ error: 'pricing_failed' });
        return;
      }
      const quote = (await pr.json()) as { total_cents: number; lines: unknown[] };
      res.status(200).json({ total_cents: quote.total_cents, lines: quote.lines });
    } catch (err) {
      deps.logger.error({ err }, 'gateway fan-out failed');
      res.status(502).json({ error: 'upstream_unavailable' });
    }
  });

  return app;
}
